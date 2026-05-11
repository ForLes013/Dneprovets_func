# migrate_age_groups.py
from app import app, db, AgeSchedule
from datetime import datetime

def migrate_database():
    with app.app_context():
        print("🔧 Начинаем миграцию базы данных...")
        
        # Создаем таблицу расписания по возрастам
        db.create_all()
        print("✅ Таблицы созданы")
        
        # Проверяем, есть ли уже расписание
        if AgeSchedule.query.count() == 0:
            print("📅 Создаем тестовое расписание...")
            
            test_schedules = [
                {"age_group": "3-5", "day_of_week": 1, "time": "17:00", "branch": "center", "capacity": 10},
                {"age_group": "3-5", "day_of_week": 3, "time": "17:00", "branch": "center", "capacity": 10},
                {"age_group": "6-8", "day_of_week": 1, "time": "18:30", "branch": "center", "capacity": 12},
                {"age_group": "6-8", "day_of_week": 3, "time": "18:30", "branch": "center", "capacity": 12},
                {"age_group": "9-12", "day_of_week": 2, "time": "17:00", "branch": "center", "capacity": 15},
                {"age_group": "9-12", "day_of_week": 4, "time": "17:00", "branch": "center", "capacity": 15},
                {"age_group": "13+", "day_of_week": 2, "time": "18:30", "branch": "center", "capacity": 15},
                {"age_group": "13+", "day_of_week": 4, "time": "18:30", "branch": "center", "capacity": 15},
            ]
            
            for schedule_data in test_schedules:
                schedule = AgeSchedule(**schedule_data)
                db.session.add(schedule)
            
            db.session.commit()
            print(f"✅ Создано {len(test_schedules)} тестовых расписаний")
        
        print("🎯 Миграция завершена успешно!")
        print("\nВозрастные группы:")
        print("  • 3-5 лет: Пн, Чт в 17:00")
        print("  • 6-8 лет: Пн, Чт в 18:30")
        print("  • 9-12 лет: Вт, Пт в 17:00")
        print("  • 13+ лет: Вт, Пт в 18:30")

if __name__ == '__main__':
    migrate_database()