import React, { useEffect, useState } from "react";
import { Award, Target, Trophy, Star } from "lucide-react";
import "../styles/components/AchievementsPage.css";

const fallbackAchievements = {
  title: "Наши достижения",
  intro:
    "Показываем не обещания, а конкретные результаты школы, команд и воспитанников.",
  items: [
    {
      value: "12+",
      title: "лет работы",
      description:
        "Системно развиваем детей и подростков в футбольной среде.",
    },
    {
      value: "350+",
      title: "воспитанников",
      description:
        "Через тренировки школы прошли сотни детей разных возрастов.",
    },
    {
      value: "40+",
      title: "турниров в год",
      description:
        "Регулярно даём детям игровую практику и соревновательный опыт.",
    },
    {
      value: "1",
      title: "единая методика",
      description:
        "Тренировочный процесс выстроен от младших групп до старших.",
    },
  ],
  news: [],
};

const achievementIcons = [Award, Trophy, Target, Star];

const normalizeAchievements = (payload) => {
  const items =
    Array.isArray(payload?.items) && payload.items.length > 0
      ? payload.items.filter(
          (item) =>
            item?.value?.trim() || item?.title?.trim() || item?.description?.trim(),
        )
      : fallbackAchievements.items;

  return {
    title: payload?.title || fallbackAchievements.title,
    intro: payload?.intro || fallbackAchievements.intro,
    items: items.length > 0 ? items : fallbackAchievements.items,
    news: Array.isArray(payload?.news)
      ? payload.news.filter(
          (item) =>
            item?.title?.trim() ||
            item?.date?.trim() ||
            item?.tag?.trim() ||
            item?.summary?.trim() ||
            item?.content?.trim(),
        )
      : fallbackAchievements.news,
  };
};

const formatNewsDate = (dateValue) => {
  if (!dateValue) {
    return "Дата уточняется";
  }

  try {
    return new Date(dateValue).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (error) {
    return dateValue;
  }
};

const AchievementsPage = () => {
  const [achievements, setAchievements] = useState(fallbackAchievements);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAchievements = async () => {
      try {
        const response = await fetch("/api/site-content");
        if (!response.ok) {
          return;
        }

        const result = await response.json();
        if (result.success) {
          setAchievements(normalizeAchievements(result.achievements));
        }
      } catch (error) {
        console.error("Ошибка загрузки достижений:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAchievements();
  }, []);

  return (
    <div className="achievements-page">
      <section className="achievements-hero">
        <div className="achievements-shell">
          <div className="achievements-hero-copy">
            <span className="achievements-kicker">Футбольная школа</span>
            <h1>{achievements.title}</h1>
            <p>{achievements.intro}</p>
          </div>

          <div className="achievements-hero-note">
            <strong>{loading ? "Обновляем данные" : "Актуально сейчас"}</strong>
            <span>
              {loading
                ? "Подтягиваем последние цифры из панели администратора."
                : "Карточки на этой странице управляются из админ-панели."}
            </span>
          </div>
        </div>
      </section>

      <section className="achievements-grid-section">
        <div className="achievements-shell">
          <div className="achievements-grid">
            {achievements.items.map((item, index) => {
              const Icon = achievementIcons[index % achievementIcons.length];

              return (
                <article key={`${item.title}-${index}`} className="achievement-card">
                  <div className="achievement-icon">
                    <Icon size={26} />
                  </div>
                  <div className="achievement-value">{item.value || "—"}</div>
                  <h2>{item.title || "Показатель"}</h2>
                  <p>{item.description || "Описание будет добавлено администратором."}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="achievements-news-section">
        <div className="achievements-shell">
          <div className="achievements-news-header">
            <span className="achievements-section-label">Новости школы</span>
            <h2>Что происходит в командах и внутри школы</h2>
            <p>
              На этой странице можно показывать результаты матчей, анонсы событий
              и важные обновления для родителей и игроков.
            </p>
          </div>

          {achievements.news.length === 0 ? (
            <div className="achievements-news-empty">
              Новости появятся здесь, как только администратор добавит первую
              публикацию из панели управления.
            </div>
          ) : (
            <div className="achievements-news-grid">
              {achievements.news.map((item, index) => (
                <article
                  key={`${item.title}-${item.date}-${index}`}
                  className="achievement-news-card"
                >
                  <div className="achievement-news-meta">
                    <span className="achievement-news-tag">
                      {item.tag || "Новости"}
                    </span>
                    <span className="achievement-news-date">
                      {formatNewsDate(item.date)}
                    </span>
                  </div>
                  <h3>{item.title || "Новость школы"}</h3>
                  <p className="achievement-news-summary">
                    {item.summary || "Короткое описание новости будет добавлено позже."}
                  </p>
                  <p className="achievement-news-content">
                    {item.content || "Подробности появятся после обновления контента."}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AchievementsPage;
