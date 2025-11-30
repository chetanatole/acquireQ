import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import socketio
from .database import init_db, AsyncSessionLocal
from .models import Resource
from .queue_manager import QueueManager

# FastAPI Setup
app = FastAPI(title="acquireQ")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Queue Manager
queue_manager = QueueManager(sio)

# Models
class CreateResourceRequest(BaseModel):
    name: str
    description: str = None
    timeoutSeconds: int = 60

class CreateResourceResponse(BaseModel):
    id: str
    adminSecret: str

# Events
@app.on_event("startup")
async def startup_event():
    await init_db()
    await queue_manager.restore_timers()


@app.post("/api/resources", response_model=CreateResourceResponse)
async def create_resource(req: CreateResourceRequest):
    resource_id = str(uuid.uuid4())
    admin_secret = str(uuid.uuid4())
    
    async with AsyncSessionLocal() as db:
        resource = Resource(
            id=resource_id,
            name=req.name,
            description=req.description,
            timeout_seconds=req.timeoutSeconds,
            admin_secret=admin_secret
        )
        db.add(resource)
        await db.commit()
        
    return {"id": resource_id, "adminSecret": admin_secret}

# Socket Events
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def join_resource(sid, resource_id):
    print(f"Client {sid} joining resource {resource_id}")
    await sio.enter_room(sid, resource_id)
    await queue_manager.broadcast_update(resource_id)

@sio.event
async def join_queue(sid, data):
    # data: { resourceId, displayName, email, userId }
    resource_id = data.get("resourceId")
    display_name = data.get("displayName")
    email = data.get("email")
    user_id = data.get("userId")
    
    if not resource_id or not display_name:
        return
        
    user_id = await queue_manager.join_queue(resource_id, display_name, email, user_id)
    # Send back the user_id so client knows who they are
    await sio.emit("joined_queue", {"userId": user_id}, room=sid)

@sio.event
async def release_resource(sid, data):
    # data: { resourceId, userId }
    resource_id = data.get("resourceId")
    user_id = data.get("userId")
    
    if await queue_manager.release_resource(resource_id, user_id):
        pass # Success

@sio.event
async def accept_offer(sid, data):
    # data: { resourceId, userId }
    resource_id = data.get("resourceId")
    user_id = data.get("userId")
    
    await queue_manager.accept_offer(resource_id, user_id)

@sio.event
async def reject_offer(sid, data):
    # data: { resourceId, userId }
    resource_id = data.get("resourceId")
    user_id = data.get("userId")
    
    await queue_manager.reject_offer(resource_id, user_id)

@sio.event
async def leave_queue(sid, data):
    # data: { resourceId, userId }
    resource_id = data.get("resourceId")
    user_id = data.get("userId")
    
    await queue_manager.leave_queue(resource_id, user_id)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
