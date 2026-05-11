# models.py
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Boolean, CheckConstraint
from datetime import datetime
import json

db = SQLAlchemy()

class Branch(db.Model):
    __tablename__ = 'branches'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    address = Column(String(200))
    phone = Column(String(20))
    email = Column(String(120))
    photo_data = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    
    # Связи
    schedules = db.relationship('AgeSchedule', backref='branch_rel', lazy=True)
    applications = db.relationship('Application', backref='branch_app', lazy=True)

class AgeSchedule(db.Model):
    __tablename__ = 'age_schedules'
    
    id = Column(Integer, primary_key=True)
    age_group = Column(String(50), nullable=False)  # "2020-2021", "2018-2019", etc
    days_of_week = Column(JSON, nullable=False)  # Храним список дней [0, 2, 4]
    time = Column(String(10), nullable=False)  # "17:00", "18:30" - время начала
    end_time = Column(String(10), nullable=False, default='18:00')  # Время окончания
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=False)
    capacity = Column(Integer, default=10)
    instructor = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    
    def get_days_display(self):
        """Получение дней недели в читаемом формате"""
        day_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        if isinstance(self.days_of_week, list):
            return [day_names[day] for day in self.days_of_week if 0 <= day < 7]
        return []
    
    def get_days_string(self):
        """Строковое представление дней"""
        days = self.get_days_display()
        return ', '.join(days) if days else ''
    
    def get_time_range(self):
        """Получение диапазона времени"""
        return f"{self.time} - {self.end_time}"
    
    __table_args__ = (
        CheckConstraint('capacity > 0', name='check_capacity'),
    )

class User(db.Model):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    email = Column(String(120), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(20))
    children = Column(JSON, default=lambda: [])  # Структура: [{"id": 1, "name": "...", "birth_year": 2018, "branch_id": 1, "branch_name": "...", ...}]
    registered_at = Column(DateTime, default=datetime.now)
    
    # Связи
    applications = db.relationship('Application', backref='user', lazy=True)
    tokens = db.relationship('Token', backref='user', lazy=True)
    payments = db.relationship('Payment', backref='user', lazy=True)
    attendances = db.relationship('Attendance', backref='user', lazy=True)

class Token(db.Model):
    __tablename__ = 'tokens'
    
    id = Column(Integer, primary_key=True)
    token = Column(String(255), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    expires_at = Column(DateTime, nullable=False)

class Application(db.Model):
    __tablename__ = 'applications'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    child_name = Column(String(100))
    birth_year = Column(Integer)  # Год рождения вместо возраста
    branch_id = Column(Integer, ForeignKey('branches.id'))
    phone = Column(String(20))
    email = Column(String(120))
    message = Column(Text)
    status = Column(String(20), default='pending')
    trainer = Column(String(100))
    training_time = Column(String(50))
    created_at = Column(DateTime, default=datetime.now)

class Payment(db.Model):
    __tablename__ = 'payments'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    child_id = Column(Integer, nullable=False)
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    amount = Column(Integer, nullable=False)
    training_count = Column(Integer, nullable=False)
    used_trainings = Column(Integer, default=0)
    remaining_trainings = Column(Integer, default=0)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    status = Column(String(20), default='pending')
    provider = Column(String(50), default='manual')
    provider_payment_id = Column(String(120))
    provider_status = Column(String(50))
    provider_confirmation_url = Column(Text)
    provider_idempotence_key = Column(String(120))
    provider_payload = Column(Text)
    payment_method = Column(String(50))
    transaction_id = Column(String(100))
    paid_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.now)
    
    # Связи
    attendances = db.relationship('Attendance', backref='payment', lazy=True)

class Attendance(db.Model):
    __tablename__ = 'attendance'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    child_id = Column(Integer, nullable=False)
    payment_id = Column(Integer, ForeignKey('payments.id'), nullable=True)
    schedule_id = Column(Integer)
    scheduled_date = Column(DateTime, nullable=False)
    actual_date = Column(DateTime)
    status = Column(String(20), default='scheduled')
    age_group = Column(String(50))
    branch_id = Column(Integer, ForeignKey('branches.id'), nullable=True)
    is_makeup = Column(Boolean, default=False)
    is_free = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.now)


class SiteSetting(db.Model):
    __tablename__ = 'site_settings'

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(JSON, nullable=False, default=lambda: {})
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
