import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from .models import Resource, User, QueueItem
from .database import AsyncSessionLocal

class QueueManager:
    def __init__(self, sio):
        self.sio = sio
        self.offer_tasks = {} # resource_id -> asyncio.Task

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
        for idx, item in enumerate(sorted_items):
            queue.append({
                "userId": item.user.id,
                "displayName": item.user.display_name,
                "isOffered": resource.active_offer_expires_at is not None and idx == 0
            })
            
        holder = None
        if resource.current_holder_id:
            holder_user = next((u for u in resource.users if u.id == resource.current_holder_id), None)
            if holder_user:
                holder = {"userId": holder_user.id, "displayName": holder_user.display_name}

        return {
            "resourceId": resource.id,
            "name": resource.name,
            "timeoutSeconds": resource.timeout_seconds,
            "holder": holder,
            "queue": queue,
            "offerExpiresAt": (resource.active_offer_expires_at.isoformat() + "Z") if resource.active_offer_expires_at else None
        }

    async def broadcast_update(self, resource_id: str):
        async with AsyncSessionLocal() as db:
            state = await self.get_resource_state(resource_id, db)
            if state:
                print(f"Broadcasting state update for {resource_id}: {len(state['queue'])} in queue, offer active: {state['offerExpiresAt'] is not None}")
                await self.sio.emit("state_update", state, room=resource_id)

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
            await db.commit()
            
            # Check if there's an active offer
            resource = await db.get(Resource, resource_id)
            has_active_offer = resource.active_offer_expires_at is not None
            
        await self.broadcast_update(resource_id)
        # Only process queue if there's no active offer (don't reset timer)
        if not has_active_offer:
            await self._process_queue(resource_id)
        return user.id

    async def release_resource(self, resource_id: str, user_id: int):
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            if not resource or resource.current_holder_id != user_id:
                return False
            
            resource.current_holder_id = None
            await db.commit()
            
        await self.broadcast_update(resource_id)
        await self._process_queue(resource_id)
        return True

    async def _process_queue(self, resource_id: str):
        print(f"[_process_queue] Processing queue for {resource_id}")
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            if resource.current_holder_id:
                print(f"[_process_queue] Resource held by user {resource.current_holder_id}, skipping offer")
                return # Already held

            # Get next in line
            result = await db.execute(
                select(QueueItem).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order).limit(1)
            )
            next_item = result.scalars().first()
            
            if not next_item:
                print("[_process_queue] Queue empty, skipping offer")
                return # Queue empty

            # Offer to next user
            print(f"[_process_queue] Offering to user {next_item.user_id}, setting expiry")
            expires_at = datetime.utcnow() + timedelta(seconds=resource.timeout_seconds)
            resource.active_offer_expires_at = expires_at
            await db.commit()
            print(f"[_process_queue] Offer committed, expires at {expires_at}")
            
            # Schedule timeout
            if resource_id in self.offer_tasks:
                print(f"[_process_queue] Cancelling existing timeout task")
                self.offer_tasks[resource_id].cancel()
            
            self.offer_tasks[resource_id] = asyncio.create_task(
                self._handle_timeout(resource_id, resource.timeout_seconds)
            )
            print(f"[_process_queue] Timeout task scheduled for {resource.timeout_seconds}s")
            
        print(f"[_process_queue] Broadcasting update to room: {resource_id}")
        await self.broadcast_update(resource_id)
        print(f"[_process_queue] Broadcast complete")

    async def _handle_timeout(self, resource_id: str, duration: int):
        print(f"[_handle_timeout] Started timeout timer for {resource_id}: {duration}s")
        await asyncio.sleep(duration)
        print(f"[_handle_timeout] Timeout triggered for {resource_id}")
        async with AsyncSessionLocal() as db:
            resource = await db.get(Resource, resource_id)
            if not resource or not resource.active_offer_expires_at:
                print("[_handle_timeout] Timer invalid or cancelled")
                return

            # Timeout expired
            # Move current offer (first in queue) to end of queue
            
            result = await db.execute(
                select(QueueItem).where(QueueItem.resource_id == resource_id).order_by(QueueItem.order)
            )
            items = result.scalars().all()
            
            if items:
                timed_out_item = items[0]
                print(f"[_handle_timeout] User {timed_out_item.user_id} timed out, moving to end")
                # Reorder: everyone else moves up, this one goes to end
                max_order = items[-1].order
                
                timed_out_item.order = max_order + 1
                
                resource.active_offer_expires_at = None
                await db.commit()
                print(f"[_handle_timeout] Committed: user moved to end, offer cleared")
                
        print(f"[_handle_timeout] Broadcasting update")
        await self.broadcast_update(resource_id)
        print(f"[_handle_timeout] Calling _process_queue to offer to next person")
        await self._process_queue(resource_id) # Offer to next
        print(f"[_handle_timeout] Timeout handling complete")

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
