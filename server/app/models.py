from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Resource(Base):
    __tablename__ = "resources"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    timeout_seconds = Column(Integer, default=60)
    admin_secret = Column(String, nullable=False)
    current_holder_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    active_offer_expires_at = Column(DateTime, nullable=True)

    users = relationship("User", back_populates="resource", foreign_keys="[User.resource_id]")
    queue_items = relationship("QueueItem", back_populates="resource", order_by="QueueItem.order")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    resource_id = Column(String, ForeignKey("resources.id"))
    joined_at = Column(DateTime, default=datetime.utcnow)

    resource = relationship("Resource", back_populates="users", foreign_keys=[resource_id])
    queue_item = relationship("QueueItem", back_populates="user", uselist=False)


class QueueItem(Base):
    __tablename__ = "queue_items"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(String, ForeignKey("resources.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    order = Column(Integer, nullable=False)

    resource = relationship("Resource", back_populates="queue_items")
    user = relationship("User", back_populates="queue_item")
