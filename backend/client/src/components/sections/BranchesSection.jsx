import React, { useState, useEffect } from "react";
import {
  MapPin,
  Clock,
  Phone,
  Star,
  X,
  Users,
  Calendar,
  ChevronRight,
  Building,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const BranchesSection = () => {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branchSchedules, setBranchSchedules] = useState({});

  const navigate = useNavigate();

  const raspNav = () => {
    navigate("/raspisanie");
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Загружаем филиалы
      const branchesResponse = await fetch("/api/admin/branches/public");
      const branchesData = await branchesResponse.json();

      if (branchesData.success) {
        setBranches(branchesData.branches);

        // Для каждого филиала загружаем расписание
        const schedulesData = {};

        for (const branch of branchesData.branches) {
          try {
            const scheduleResponse = await fetch(
              `/api/admin/age-schedules/public?branch_id=${branch.id}`,
            );
            const scheduleData = await scheduleResponse.json();

            if (scheduleData.success) {
              // Преобразуем данные расписания, добавляя end_time если его нет
              const processedSchedule = {};

              Object.entries(scheduleData.schedule || {}).forEach(
                ([day, times]) => {
                  processedSchedule[day] = {};
                  Object.entries(times).forEach(([time, slots]) => {
                    processedSchedule[day][time] = slots.map((slot) => ({
                      ...slot,
                      // Если нет end_time, рассчитываем из времени начала + 1 час
                      end_time:
                        slot.end_time ||
                        (() => {
                          const [hours, minutes] = time.split(":").map(Number);
                          const endHour = hours + 1;
                          return `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
                        })(),
                    }));
                  });
                },
              );

              schedulesData[branch.id] = processedSchedule;
            }
          } catch (err) {
            console.error(
              `Ошибка загрузки расписания для филиала ${branch.id}:`,
              err,
            );
            schedulesData[branch.id] = {};
          }
        }

        setBranchSchedules(schedulesData);
      } else {
        setError("Ошибка загрузки филиалов");
      }
    } catch (err) {
      console.error("Ошибка загрузки данных:", err);
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  };

  // Функция для получения времени работы филиала на основе расписания
  const getWorkingHours = (branchId) => {
    const schedules = branchSchedules[branchId] || {};

    // ВЫВОДИМ В КОНСОЛЬ РЕАЛЬНЫЕ ДАННЫЕ
    console.log(
      `🔍 ФИЛИАЛ ${branchId}: ПОЛНЫЕ ДАННЫЕ`,
      JSON.stringify(schedules, null, 2),
    );

    // Функция для конвертации времени в минуты
    const timeToMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    let earliestStartMinutes = Infinity;
    let earliestStartTime = null;
    let latestEndMinutes = -Infinity;
    let latestEndTime = null;

    // Проходим по всем дням
    Object.entries(schedules).forEach(([day, daySchedule]) => {
      console.log(`  День ${day}:`, daySchedule);

      // Проходим по всем временам в этом дне
      Object.entries(daySchedule).forEach(([timeKey, slots]) => {
        console.log(`    Время ${timeKey}:`, slots);

        const startMinutes = timeToMinutes(timeKey);

        // Проверяем время начала
        if (startMinutes < earliestStartMinutes) {
          earliestStartMinutes = startMinutes;
          earliestStartTime = timeKey;
        }

        // Проверяем каждый слот на наличие времени окончания
        slots.forEach((slot, idx) => {
          // Ищем end_time в разных возможных местах
          const possibleEndTime =
            slot.end_time || slot.endTime || slot.time_end;

          if (possibleEndTime) {
            const endMinutes = timeToMinutes(possibleEndTime);
            console.log(
              `      Слот ${idx + 1}: найден end_time = ${possibleEndTime} (${endMinutes} мин)`,
            );

            if (endMinutes > latestEndMinutes) {
              latestEndMinutes = endMinutes;
              latestEndTime = possibleEndTime;
            }
          } else {
            // Если end_time нет, рассчитываем из времени начала + 1 час
            const [hours, minutes] = timeKey.split(":").map(Number);
            const endHour = hours + 1;
            const calculatedEndTime = `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
            const endMinutes = timeToMinutes(calculatedEndTime);

            console.log(
              `      Слот ${idx + 1}: нет end_time, рассчитываем = ${calculatedEndTime} (${endMinutes} мин)`,
            );

            if (endMinutes > latestEndMinutes) {
              latestEndMinutes = endMinutes;
              latestEndTime = calculatedEndTime;
            }
          }
        });
      });
    });

    console.log("📊 ИТОГОВЫЕ ЗНАЧЕНИЯ:", {
      earliestStartTime,
      earliestStartMinutes,
      latestEndTime,
      latestEndMinutes,
      branchId,
    });

    // Если ничего не нашли, возвращаем дефолтное время
    if (!earliestStartTime || !latestEndTime) {
      console.log(
        "  ⚠️ Расписание не найдено, используем дефолтное 09:00-21:00",
      );
      return "09:00-21:00";
    }

    const result = `${earliestStartTime}-${latestEndTime}`;
    console.log(`📊 Итог для филиала ${branchId}: ${result}`);

    return result;
  };

  // Функция для получения количества групп в филиале
  const getGroupsCount = (branchId) => {
    const schedules = branchSchedules[branchId] || {};

    // Считаем уникальные возрастные группы
    const uniqueGroups = new Set();
    Object.values(schedules).forEach((daySchedule) => {
      Object.values(daySchedule).forEach((timeSlots) => {
        timeSlots.forEach((slot) => {
          if (slot.ageGroup) {
            uniqueGroups.add(slot.ageGroup);
          }
        });
      });
    });

    return uniqueGroups.size;
  };

  // Функция для получения возрастных групп филиала
  const getAgeGroups = (branchId) => {
    const schedules = branchSchedules[branchId] || {};
    const groups = new Set();

    Object.values(schedules).forEach((daySchedule) => {
      Object.values(daySchedule).forEach((timeSlots) => {
        timeSlots.forEach((slot) => {
          if (slot.ageGroup) {
            groups.add(slot.ageGroup);
          }
        });
      });
    });

    return Array.from(groups).sort().reverse(); // Сортировка от старших к младшим
  };

  // Функция для получения рейтинга филиала
  const getBranchRating = (branch) => {
    // Здесь можно добавить логику для расчета рейтинга
    return 4.8;
  };

  // Функция для получения количества отзывов
  const getReviewsCount = (branch) => {
    // Здесь можно добавить логику для подсчета отзывов
    return 24;
  };

  const handleBranchClick = (branch) => {
    setSelectedBranch(branch);
  };

  const closeModal = () => {
    setSelectedBranch(null);
  };

  if (loading) {
    return (
      <section className="branches-section">
        <div className="section-container">
          <div className="branches-section-header">
            <h2 className="branches-section-title">Наши филиалы</h2>
            <p className="branches-section-subtitle">Загрузка филиалов...</p>
          </div>
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="branches-section">
        <div className="section-container">
          <div className="branches-section-header">
            <h2 className="branches-section-title">Наши филиалы</h2>
            <p className="branches-section-subtitle error">{error}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="branches-section" id="branches">
      <div className="section-container">
        <div className="branches-section-header">
          <h2 className="branches-section-title">Наши филиалы</h2>
          <p className="branches-section-subtitle">
            Выберите удобный для вас филиал футбольной школы "Днепровец"
          </p>
        </div>

        {branches.length === 0 ? (
          <div className="empty-state">
            <Building size={48} />
            <h3>Филиалы пока не добавлены</h3>
            <p>Скоро здесь появятся наши филиалы</p>
          </div>
        ) : (
          <div className="branches-grid">
            {branches.map((branch) => {
              const groupsCount = getGroupsCount(branch.id);
              const ageGroups = getAgeGroups(branch.id);

              return (
                <div
                  key={branch.id}
                  className="branch-card1"
                  onClick={() => handleBranchClick(branch)}
                >
                  <div className="branch-image">
                    {branch.photo_data ? (
                      <img
                        src={branch.photo_data}
                        alt={branch.name}
                        className="branch-photo-display"
                      />
                    ) : (
                      <div className="image-placeholder">
                        <Building size={48} />
                        <span>{branch.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="branch-content">
                    <div className="branch-header">
                      <h3 className="branch-name">{branch.name}</h3>
                    </div>

                    <div className="branch-address">
                      <MapPin size={16} />
                      <span>{branch.address}</span>
                    </div>

                    <div className="branch-info">
                      <div className="info-item">
                        <Clock size={14} />
                        <span>Ежедневно: 09:00-21:00</span>
                      </div>
                      <div className="info-item">
                        <Users size={14} />
                        <span>{groupsCount} групп</span>
                      </div>
                    </div>

                    {ageGroups.length > 0 && (
                      <div className="branch-features">
                        {ageGroups.slice(0, 3).map((group, index) => (
                          <span key={index} className="feature-tag">
                            {group}
                          </span>
                        ))}
                        {ageGroups.length > 3 && (
                          <span className="feature-more">
                            +{ageGroups.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <button className="branch-button">
                      Подробнее
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модальное окно с деталями филиала */}
      {selectedBranch && (
        <div className="branches-modal-overlay" onClick={closeModal}>
          <div
            className="branches-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="branches-close-button" onClick={closeModal}>
              <X size={20} />
            </button>

            <div className="branches-modal-header">
              <div className="branches-modal-rating">
                <Star size={20} fill="#d4a574" />
                <span>{getBranchRating(selectedBranch)}</span>
                <span className="reviews">
                  ({getReviewsCount(selectedBranch)} отзывов)
                </span>
              </div>
              <h2>{selectedBranch.name}</h2>
            </div>

            <div className="branches-modal-body">
              <div className="branches-modal-image">
                {selectedBranch.photo_data ? (
                  <img
                    src={selectedBranch.photo_data}
                    alt={selectedBranch.name}
                    className="branch-photo-display"
                  />
                ) : (
                  <div className="image-placeholder large">
                    <Building size={64} />
                  </div>
                )}
              </div>

              <div className="branches-modal-details">
                <div className="branches-detail-section">
                  <h4>О филиале</h4>
                  <p>
                    Футбольная школа "Днепровец" в филиале "
                    {selectedBranch.name}" предлагает профессиональные
                    тренировки для детей от 3 до 17 лет. Современное
                    оборудование, опытные тренеры и комфортная атмосфера.
                  </p>
                </div>

                <div className="branches-detail-section">
                  <h4>Адрес и контакты</h4>
                  <div className="branches-contact-info">
                    <div className="branches-contact-item">
                      <MapPin size={18} />
                      <span>{selectedBranch.address}</span>
                    </div>
                    {selectedBranch.phone && (
                      <div className="branches-contact-item">
                        <Phone size={18} />
                        <span>{selectedBranch.phone}</span>
                      </div>
                    )}
                    {selectedBranch.email && (
                      <div className="branches-contact-item">
                        <span>📧</span>
                        <span>{selectedBranch.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="branches-detail-section">
                  <h4>Время работы</h4>
                  <div className="branches-contact-info">
                    <div className="branches-contact-item">
                      <Calendar size={18} />
                      <span>
                        Ежедневно: {getWorkingHours(selectedBranch.id)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="branches-detail-section">
                  <h4>Возрастные группы</h4>
                  <div className="branches-features-grid">
                    {getAgeGroups(selectedBranch.id).map((group, index) => (
                      <div key={index} className="branches-feature-item">
                        {group}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="branches-modal-actions">
              <button className="branches-primary-button">
                Записаться на пробное занятие
              </button>
              <button className="branches-secondary-button" onClick={raspNav}>
                Посмотреть расписание
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default BranchesSection;
