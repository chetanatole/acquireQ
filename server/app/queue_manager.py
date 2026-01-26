import asyncio
import os
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
import aiosmtplib
from .models import Resource, User, QueueItem
from .database import AsyncSessionLocal

# Load .env file from server directory
load_dotenv(Path(__file__).parent.parent / ".env")

# SMTP Configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173")

class QueueManager:
    def __init__(self, sio):
        self.sio = sio
        self.offer_tasks = {} # resource_id -> asyncio.Task

    async def _send_turn_email(self, user_email: str, resource_name: str, resource_id: str, timeout_seconds: int):
        """Send email notification when it's the user's turn"""
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            print(f"SMTP not configured, skipping email to {user_email}")
            return

        if not user_email:
            return

        resource_url = f"{APP_BASE_URL}/resource/{resource_id}"

        try:
            message = EmailMessage()
            message["From"] = SMTP_FROM
            message["To"] = user_email
            message["Subject"] = f"Your Turn - {resource_name}"
            message.set_content(
                f"It's your turn to access {resource_name}!\n\n"
                f"You have {timeout_seconds} seconds to accept the offer.\n\n"
                f"Click here to accept or reject:\n{resource_url}\n\n"
                f"- acquireQ"
            )

            await aiosmtplib.send(
                message,
                hostname=SMTP_HOST,
                port=SMTP_PORT,
                username=SMTP_USER,
                password=SMTP_PASSWORD,
                start_tls=True,
            )
            print(f"Turn notification email sent to {user_email}")
        except Exception as e:
            print(f"Failed to send email to {user_email}: {e}")

    async def get_resource_state(self, resource_id: str, db):
        result = await db.execute(
            select(Resource)
            .options(
                selectinload(Resource.queue_items).selectinload(QueueItem.user),
                selectinload(Resource.users)
            )
            .where(Resource.id == resource_id)
        )
        resource = result.scalars().first()
        if not resource:
            return None
        
        queue = []
        sorted_items = sorted(resource.queue_items, key=lambda x: x.order)
        now = datetime.utcnow()
        offer_active = resource.active_offer_expires_at is not None and resource.active_offer_expires_at > now
        for idx, item in enumerate(sorted_items):
            queue.append({
                "userId": item.user.id,
                "displayName": item.user.display_name,
                "isOffered": offer_active and idx == 0
            })
            
        holder = None
        if resource.current_holder_id:
            holder_user = next((u for u in resource.users if u.id == resource.current_holder_id), None)
            if holder_user:
                holder = {"userId": holder_user.id, "displayName": holder_user.display_name}

        return {
            "resourceId": resource.id,
            "name": resource.name,
            "description": resource.description,
            "timeoutSeconds": resource.timeout_seconds,
            "holder": holder,
            "queue": queue,
            "offerExpiresAt": (resource.active_offer_expires_at.isoformat() + "Z") if resource.active_offer_expires_at else None
        }

    async def broadcast_update(self, resource_id: str):
        try:
            async with AsyncSessionLocal() as db:
                state = await self.get_resource_state(resource_id, db)
                if state:
                    # Check if any user is marked as offered (isOffered is based on non-expired offer)
                    any_offered = any(u.get('isOffered') for u in state['queue'])
                    print(f"Broadcasting state update for {resource_id}: {len(state['queue'])} in queue, offer active: {any_offered}")
                    await self.sio.emit("state_update", state, room=resource_id)
                    print(f"Broadcast complete for {resource_id}")
        except Exception as e:
            print(f"ERROR broadcasting update for {resource_id}: {e}")

    async def join_queue(self, resource_id: str, display_name: str, email: str = None, user_id: int = None):
        async with AsyncSessionLocal() as db:
            user = None
            if user_id:
                user = await db.get(User, user_id)
            
            if not user:
                # Create User
                user = User(display_name=display_name, email=email, resource_id=resource_id)
                db.add(user)
                await db.flush()
            
            # Check if already in queue
            existing_item = await db.execute(select(QueueItem).where(QueueItem.user_id == user.id))
            if existing_item.scalars().first():
                return user.id # Already in queue

            # Add to Queue
            # Get max order
            result = await db.execute(select(func.max(QueueItem.order)).where(QueueItem.resource_id == resource_id))
            max_order = result.scalar() or 0
            
            queue_item = QueueItem(resource_id=resource_id, user_id=user.id, order=max_order + 1)
            db.add(queue_item)
            await self._update_activity(resource_id, db)
            await db.commit()
            
            # Check if there's an active (non-expired) offer
            resource = await db.get(Resource, resource_id)
            now = datetime.utcnow()
            has_active_offer = (resource.active_offer_expires_at is not None and
                               resource.active_offer_expires_at > now)

            # Clear expired offer if present
            if resource.active_offer_expires_at is not None and resource.active_offer_expires_at <= now:
                resource.active_offer_expires_at = None
                await db.commit()

        await self.broadcast_update(resource_id)
        # Only process queue if there's no active offer (don't reset timer)
        # Skip email since user just joined and is already on the page
        # Allow auto-accept since this is a fresh join (not a release)
        if not has_active_offer:
            await self._process_queue(resource_id, skip_email=True, allow_auto_accept=True)
        return user.id

    async def release_resource(self, resource_id: str, user_id: int):
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            if not resource or resource.current_holder_id != user_id:
                return False

            resource.current_holder_id = None
            await self._update_activity(resource_id, db)
            await db.commit()
            
        await self.broadcast_update(resource_id)
        await self._process_queue(resource_id)
        return True

    async def _process_queue(self, resource_id: str, skip_email: bool = False, allow_auto_accept: bool = False):
        """Process the queue and offer to the next user in line"""
        timeout_seconds = None
        user_email = None
        resource_name = None
        try:
            async with AsyncSessionLocal() as db:
                resource = await db.get(Resource, resource_id)
                if resource.current_holder_id:
                    return  # Already held

                # Get next in line with user info
                result = await db.execute(
                    select(QueueItem)
                    .options(selectinload(QueueItem.user))
                    .where(QueueItem.resource_id == resource_id)
                    .order_by(QueueItem.order)
                    .limit(1)
                )
                next_item = result.scalars().first()

                if not next_item:
                    return  # Queue empty

                # Count total queue size
                count_result = await db.execute(
                    select(func.count(QueueItem.id)).where(QueueItem.resource_id == resource_id)
                )
                queue_size = count_result.scalar()

                # If only one person in queue and auto-accept is allowed, give immediate access
                # (only when joining fresh, not when resource is released)
                if queue_size == 1 and allow_auto_accept:
                    print(f"Only one person in queue, auto-accepting user {next_item.user_id}")
                    resource.current_holder_id = next_item.user_id
                    await db.delete(next_item)
                    await self._update_activity(resource_id, db)
                    await db.commit()
                    await self.broadcast_update(resource_id)
                    return

                # Offer to next user with timeout
                expires_at = datetime.utcnow() + timedelta(seconds=resource.timeout_seconds)
                resource.active_offer_expires_at = expires_at
                await db.commit()
                print(f"Offering to user {next_item.user_id}, expires at {expires_at}")

                timeout_seconds = resource.timeout_seconds
                user_email = next_item.user.email
                resource_name = resource.name

            # Cancel existing timeout task if any (but don't cancel if we're inside it)
            if resource_id in self.offer_tasks:
                existing_task = self.offer_tasks[resource_id]
                current_task = asyncio.current_task()
                # Don't cancel if we're inside the task or if it's already done
                if existing_task != current_task and not existing_task.done():
                    try:
                        existing_task.cancel()
                    except Exception:
                        pass

            # Broadcast update to clients
            await self.broadcast_update(resource_id)

            # Send email notification if user has email (skip if user just joined)
            if user_email and not skip_email:
                asyncio.create_task(self._send_turn_email(user_email, resource_name, resource_id, timeout_seconds))

            # Schedule timeout task
            self.offer_tasks[resource_id] = asyncio.create_task(
                self._handle_timeout(resource_id, timeout_seconds)
            )

        except Exception as e:
            print(f"Error in _process_queue: {type(e).__name__}: {e}")

    async def _handle_timeout(self, resource_id: str, duration: int):
        """Handle timeout when user doesn't accept offer in time"""
        await asyncio.sleep(duration)
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            if not resource or not resource.active_offer_expires_at:
                return  # Timer invalid or cancelled

            # Move current offer (first in queue) to end of queue
            result = await db.execute(
                select(QueueItem).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order)
            )
            items = result.scalars().all()

            if items:
                timed_out_item = items[0]
                print(f"User {timed_out_item.user_id} timed out, moving to end of queue")
                max_order = items[-1].order
                timed_out_item.order = max_order + 1
                resource.active_offer_expires_at = None
                await db.commit()

        await self.broadcast_update(resource_id)
        await self._process_queue(resource_id)  # Offer to next

    async def accept_offer(self, resource_id: str, user_id: int):
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            
            # Verify user is first in queue
            result = await db.execute(
                select(QueueItem).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order).limit(1)
            )
            first_item = result.scalars().first()
            
            if not first_item or first_item.user_id != user_id:
                return False
                
            if not resource.active_offer_expires_at:
                return False # Offer expired or not active

            # Make holder
            resource.current_holder_id = user_id
            resource.active_offer_expires_at = None

            # Remove from queue
            await db.delete(first_item)
            await self._update_activity(resource_id, db)
            await db.commit()

            # Cancel timeout task
            if resource_id in self.offer_tasks:
                self.offer_tasks[resource_id].cancel()

        await self.broadcast_update(resource_id)
        return True

    async def reject_offer(self, resource_id: str, user_id: int):
        """Reject the offer and leave the queue"""
        print(f"User {user_id} rejecting offer for {resource_id}")
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            
            # Verify user is first in queue
            result = await db.execute(
                select(QueueItem).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order).limit(1)
            )
            first_item = result.scalars().first()
            
            if not first_item or first_item.user_id != user_id:
                return False
                
            if not resource.active_offer_expires_at:
                return False # Offer expired or not active

            # Remove from queue
            await db.delete(first_item)

            # Clear offer
            resource.active_offer_expires_at = None
            await self._update_activity(resource_id, db)
            await db.commit()

            # Cancel timeout task
            if resource_id in self.offer_tasks:
                self.offer_tasks[resource_id].cancel()

        await self.broadcast_update(resource_id)
        await self._process_queue(resource_id)  # Offer to next person
        return True

    async def leave_queue(self, resource_id: str, user_id: int):
        """Remove user from queue"""
        print(f"User {user_id} leaving queue for {resource_id}")
        async with AsyncSessionLocal() as db:
            # Find and delete the queue item
            result = await db.execute(
                select(QueueItem).where(
                    QueueItem.resource_id == resource_id,
                    QueueItem.user_id == user_id
                )
            )
            queue_item = result.scalars().first()
            
            if not queue_item:
                return False
            
            # Check if this user was being offered
            resource = await db.get(Resource, resource_id)
            was_offered = (resource.active_offer_expires_at is not None and 
                          queue_item.order == (await db.execute(
                              select(QueueItem.order).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order).limit(1)
                          )).scalar())
            
            await db.delete(queue_item)

            # If they were being offered, clear the offer
            if was_offered:
                resource.active_offer_expires_at = None
                if resource_id in self.offer_tasks:
                    self.offer_tasks[resource_id].cancel()

            await self._update_activity(resource_id, db)
            await db.commit()
                
        await self.broadcast_update(resource_id)
        
        # If they were being offered, process queue to offer to next person
        if was_offered:
            await self._process_queue(resource_id)
            
        return True

    async def restore_timers(self):
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Resource).where(Resource.active_offer_expires_at > datetime.utcnow())
            )
            resources = result.scalars().all()

            for resource in resources:
                remaining = (resource.active_offer_expires_at - datetime.utcnow()).total_seconds()
                if remaining > 0:
                    print(f"Restoring timer for resource {resource.id}, remaining: {remaining}s")
                    self.offer_tasks[resource.id] = asyncio.create_task(
                        self._handle_timeout(resource.id, remaining)
                    )
                else:
                    # Already expired while down? Handle it immediately
                    print(f"Timer expired while down for resource {resource.id}")
                    asyncio.create_task(self._handle_timeout(resource.id, 0))

    async def _update_activity(self, resource_id: str, db):
        """Update last_activity_at timestamp for a resource"""
        resource = await db.get(Resource, resource_id)
        if resource:
            resource.last_activity_at = datetime.utcnow()

    async def cleanup_inactive_resources(self, inactive_hours: int = 24):
        """Delete resources that have been inactive for the specified hours"""
        cutoff = datetime.utcnow() - timedelta(hours=inactive_hours)
        async with AsyncSessionLocal() as db:
            # Find inactive resources
            result = await db.execute(
                select(Resource).where(
                    (Resource.last_activity_at < cutoff) |
                    (Resource.last_activity_at == None)
                )
            )
            inactive_resources = result.scalars().all()

            for resource in inactive_resources:
                print(f"Cleaning up inactive resource: {resource.id} ({resource.name})")

                # Cancel any active timeout task
                if resource.id in self.offer_tasks:
                    self.offer_tasks[resource.id].cancel()
                    del self.offer_tasks[resource.id]

                # Delete queue items
                await db.execute(
                    delete(QueueItem).where(QueueItem.resource_id == resource.id)
                )

                # Delete users
                await db.execute(
                    delete(User).where(User.resource_id == resource.id)
                )

                # Delete resource
                await db.delete(resource)

            await db.commit()

            if inactive_resources:
                print(f"Cleaned up {len(inactive_resources)} inactive resource(s)")

            return len(inactive_resources)
