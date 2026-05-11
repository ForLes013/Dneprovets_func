import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Настройки почты
    MAIL_SERVER = 'smtp.yandex.ru'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False
    MAIL_USERNAME = 'makarkaleev@yandex.ru'
    MAIL_PASSWORD ='jgazqtufgggilpqb'
    MAIL_DEFAULT_SENDER = 'makarkaleev@yandex.ru'
    
    # Настройки приложения
    SECRET_KEY = 'jgazqtufgggilpqb'
    
    # Получатели заявок
    RECIPIENT_EMAILS = 'makarkaleev@yandex.ru'