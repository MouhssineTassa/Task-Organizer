import { Router } from "express";
import { getTotalXp, getXpByCategory, levelFromXp, divisionFromLevel } from "../services/xpEngine";
import { getBestStreakAcrossHabits, getAllHabitsWithStreaks } from "../services/streakEngine";
import { getAchievementsWithProgress, evaluateAchievements } from "../services/achievementsEngine";

const router = Router();

router.get("/", (_req, res) => {
  evaluateAchievements(); // recalcule au passage, sans jamais retirer un trophée déjà obtenu
  const totalXp = getTotalXp();
  const { level, xpIntoLevel, xpForNextLevel } = levelFromXp(totalXp);
  const division = divisionFromLevel(level);
  const bestStreak = getBestStreakAcrossHabits();
  const skills = getXpByCategory();
  const achievements = getAchievementsWithProgress();

  res.json({
    totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    division,
    bestStreak,
    skills,
    achievements,
    recentUnlocked: (achievements as any[]).filter((a) => a.unlocked_at).slice(0, 5),
  });
});

router.get("/habits-summary", (_req, res) => {
  res.json(getAllHabitsWithStreaks());
});

export default router;
