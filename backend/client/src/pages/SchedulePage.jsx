import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader,
} from "lucide-react";

const SchedulePage = () => {
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedAge, setSelectedAge] = useState("all");
  const [currentWeek, setCurrentWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [scheduleData, setScheduleData] = useState({});
  const [branches, setBranches] = useState([
    { id: "all", name: "Все филиалы" },
  ]);
  const [ageGroups, setAgeGroups] = useState([
    { id: "all", name: "Все возраста" },
  ]);
  const [timeSlots, setTimeSlots] = useState([]);

  const API_BASE_URL = "http://localhost:5000";

  // Загружаем филиалы при загрузке компонента
  useEffect(() => {
    loadBranches();
  }, []);

  // Загружаем расписание при изменении фильтров
  useEffect(() => {
    if (!loadingBranches) {
      fetchSchedule();
    }
  }, [selectedBranch, selectedAge, loadingBranches, currentWeek]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);

      console.log("Загружаем филиалы...");

      // Используем публичный endpoint
      const branchesResponse = await fetch(`/api/admin/branches/public`);

      if (!branchesResponse.ok) {
        throw new Error(`HTTP error! status: ${branchesResponse.status}`);
      }

      const branchesData = await branchesResponse.json();

      console.log("Данные филиалов с сервера:", branchesData);

      if (branchesData.success && branchesData.branches) {
        // Преобразуем филиалы в нужный формат
        const formattedBranches = [
          { id: "all", name: "Все филиалы" },
          ...branchesData.branches.map((branch) => ({
            id: `branch_${branch.id}`, // Используем префикс branch_ для ID
            originalId: branch.id, // Оригинальный ID для API запросов
            name: branch.name,
            address: branch.address,
          })),
        ];

        console.log("Отформатированные филиалы:", formattedBranches);
        setBranches(formattedBranches);
      } else {
        console.error("Ошибка в данных филиалов:", branchesData.error);
        // Fallback - тестовые филиалы
        setBranches(getFallbackBranches());
      }
    } catch (error) {
      console.error("Ошибка загрузки филиалов:", error);
      // Fallback - тестовые филиалы
      setBranches(getFallbackBranches());
    } finally {
      setLoadingBranches(false);
    }
  };

  // Fallback филиалы на случай ошибки
  const getFallbackBranches = () => {
    return [
      { id: "all", name: "Все филиалы" },
      { id: "branch_1", name: "Центральный Арена", originalId: 1 },
      { id: "branch_2", name: "Северный Стадион", originalId: 2 },
      { id: "branch_3", name: "Южная Академия", originalId: 3 },
      { id: "branch_4", name: "Западный Парк", originalId: 4 },
      { id: "branch_5", name: "Восточный Олимп", originalId: 5 },
    ];
  };

  const fetchSchedule = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (selectedBranch !== "all") {
        // Извлекаем оригинальный ID из branch_X
        const branchMatch = selectedBranch.match(/branch_(\d+)/);
        if (branchMatch && branchMatch[1]) {
          params.append("branch_id", branchMatch[1]);
        } else {
          // Или находим филиал в списке и берем originalId
          const branch = branches.find((b) => b.id === selectedBranch);
          if (branch && branch.originalId) {
            params.append("branch_id", branch.originalId);
          }
        }
      }

      if (selectedAge !== "all") {
        params.append("age_group", selectedAge);
      }

      // Добавляем параметр недели (можно реализовать позже)
      // params.append("week_offset", currentWeek);

      console.log("Запрос расписания с параметрами:", params.toString());

      const response = await fetch(`/api/admin/age-schedules/public?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Получены данные расписания:", data);

      if (data.success) {
        setScheduleData(data.schedule || {});

        // Извлекаем уникальные временные слоты из расписания
        const uniqueTimeSlots = new Set();
        Object.values(data.schedule || {}).forEach((daySchedule) => {
          Object.keys(daySchedule).forEach((time) => {
            uniqueTimeSlots.add(time);
          });
        });

        // Сортируем временные слоты
        const sortedTimeSlots = Array.from(uniqueTimeSlots).sort((a, b) => {
          const [aHours, aMinutes] = a.split(":").map(Number);
          const [bHours, bMinutes] = b.split(":").map(Number);
          return aHours * 60 + aMinutes - (bHours * 60 + bMinutes);
        });

        setTimeSlots(sortedTimeSlots);
        console.log("Уникальные временные слоты:", sortedTimeSlots);

        // Извлекаем уникальные возрастные группы из расписания
        const uniqueAgeGroups = new Set();
        Object.values(data.schedule || {}).forEach((daySchedule) => {
          Object.values(daySchedule).forEach((trainings) => {
            trainings.forEach((training) => {
              uniqueAgeGroups.add(training.ageGroup);
            });
          });
        });

        const formattedAgeGroups = [
          { id: "all", name: "Все возраста" },
          ...Array.from(uniqueAgeGroups).map((group) => ({
            id: group,
            name: group,
          })),
        ];
        setAgeGroups(formattedAgeGroups);
      } else {
        console.error("Ошибка от сервера:", data.error);
        setScheduleData({});
        setTimeSlots([]);
      }
    } catch (error) {
      console.error("Ошибка загрузки расписания:", error);
      setScheduleData({});
      setTimeSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const daysOfWeek = [
    { id: "mon", name: "Понедельник", short: "ПН" },
    { id: "tue", name: "Вторник", short: "ВТ" },
    { id: "wed", name: "Среда", short: "СР" },
    { id: "thu", name: "Четверг", short: "ЧТ" },
    { id: "fri", name: "Пятница", short: "ПТ" },
    { id: "sat", name: "Суббота", short: "СБ" },
    { id: "sun", name: "Воскресенье", short: "ВС" },
  ];

  const getBranchName = (branchId) => {
    const branch = branches.find((b) => b.id === branchId);
    return branch ? branch.name : branchId.replace("branch_", "Филиал ");
  };

  const getTrainingsForSlot = (day, time) => {
    const daySchedule = scheduleData[day.id] || {};
    const trainings = daySchedule[time] || [];

    return trainings.filter(
      (training) =>
        (selectedBranch === "all" || training.branch === selectedBranch) &&
        (selectedAge === "all" || training.ageGroup === selectedAge),
    );
  };

  const handleBooking = (training) => {
    console.log("Запись на тренировку:", training);
    // Здесь можно добавить логику записи
    alert(
      `Запись на тренировку: ${training.group} в ${training.time} - ${training.endTime || "?"}`,
    );
  };

  const navigateWeek = (direction) => {
    setCurrentWeek((prev) => prev + direction);
  };

  // Отображение
  if (loadingBranches) {
    return (
      <div className="schedule-page1">
        <div className="schedule-container1">
          <div className="loading-state">
            <Loader size={48} className="spin" />
            <p>Загрузка филиалов...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-page1">
      <div className="schedule-container1">
        {/* Заголовок */}
        <div className="schedule-header1">
          <h1 className="schedule-title1">Расписание тренировок</h1>
          <p className="schedule-subtitle1">
            Выберите удобное время и записывайтесь на тренировки. Таблица
            показывает все занятия на неделю.
          </p>
        </div>

        {/* Фильтры и навигация */}
        <div className="schedule-controls1">
          <div className="week-navigation1">
            <button className="nav-button1" onClick={() => navigateWeek(-1)}>
              <ChevronLeft size={20} />
              Пред. неделя
            </button>

            <div className="current-week1">
              <Calendar size={20} />
              <span>Неделя {currentWeek + 1}</span>
            </div>

            <button className="nav-button1" onClick={() => navigateWeek(1)}>
              След. неделя
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="filters1">
            <div className="filter-group1">
              <Filter size={18} />
              <span>Филиал:</span>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  console.log("Выбран филиал:", e.target.value);
                  setSelectedBranch(e.target.value);
                }}
                className="filter-select1"
                disabled={loadingBranches}
              >
                {branches.map((branch) => (
                  <option
                    key={branch.id}
                    value={branch.id}
                    style={{ color: "black" }}
                  >
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group1">
              <span>Возраст:</span>
              <select
                value={selectedAge}
                onChange={(e) => setSelectedAge(e.target.value)}
                className="filter-select1"
                disabled={loading}
              >
                {ageGroups.map((age) => (
                  <option
                    key={age.id}
                    value={age.id}
                    style={{ color: "black" }}
                  >
                    {age.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="schedule-table-container1">
            <div className="loading-state">
              <Loader size={48} className="spin" />
              <p>Загрузка расписания...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Таблица расписания */}
            {timeSlots.length > 0 ? (
              <div className="schedule-table-container1">
                <div className="schedule-table1">
                  {/* Заголовок таблицы */}
                  <div className="table-header1">
                    <div className="time-column1">Время</div>
                    {daysOfWeek.map((day) => (
                      <div key={day.id} className="day-column1">
                        <div className="day-short1">{day.short}</div>
                        <div className="day-full1">{day.name}</div>
                      </div>
                    ))}
                  </div>

                  {/* Тело таблицы */}
                  <div className="table-body1">
                    {timeSlots.map((time) => (
                      <div key={time} className="time-row1">
                        <div className="time-slot1">
                          <Clock size={16} />
                          {time}
                        </div>

                        {daysOfWeek.map((day) => {
                          const trainings = getTrainingsForSlot(day, time);

                          return (
                            <div key={day.id} className="day-cell1">
                              {trainings.map((training, index) => (
                                <div
                                  key={index}
                                  className="training-block1"
                                  style={{
                                    borderLeftColor: "#4169e1",
                                  }}
                                  onClick={() => handleBooking(training)}
                                >
                                  <div className="training-time1">
                                    {time}
                                    {training.endTime &&
                                      ` - ${training.endTime}`}
                                  </div>
                                  <div className="training-group1">
                                    {training.group}
                                  </div>
                                  <div className="training-coach1">
                                    {training.coach}
                                  </div>
                                  <div className="training-details1">
                                    <span className="training-branch1">
                                      <MapPin size={12} />
                                      {training.branch_name}
                                    </span>
                                    <span className="training-age1">
                                      <Users size={12} />
                                      {training.ageGroup}
                                    </span>
                                  </div>
                                  <button
                                    className="book-button1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleBooking(training);
                                    }}
                                  >
                                    Записаться
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Calendar size={48} />
                <h3>Расписаний на выбранную неделю нет</h3>
                <p>
                  Попробуйте выбрать другие фильтры или проверьте настройки
                  расписания в админке
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SchedulePage;
