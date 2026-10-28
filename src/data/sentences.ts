export type Level = "A1" | "A2" | "B1" | "B2";
export type Difficulty = Level | "all";

export const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: "all", label: "Mixed", hint: "All levels" },
  { value: "A1", label: "Beginner", hint: "A1" },
  { value: "A2", label: "Elementary", hint: "A2" },
  { value: "B1", label: "Intermediate", hint: "B1" },
  { value: "B2", label: "Upper-intermediate", hint: "B2" },
];

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.some((d) => d.value === value);
}

export interface SentencePair {
  id: string;
  vi: string;
  en: string;
  level: Level;
  topic: string;
  /** True when produced by the model at runtime rather than curated. */
  generated?: boolean;
}

/** Small curated fallback bank: 5 per level. Used for the instant first sentence and when generation is unavailable. */
export const sentences: SentencePair[] = [
  { id: "a1-01", level: "A1", topic: "daily life", vi: "Tôi đã đi chợ sáng nay.", en: "I went to the market this morning." },
  { id: "a1-02", level: "A1", topic: "weather", vi: "Hôm nay trời rất nóng.", en: "It is very hot today." },
  { id: "a1-03", level: "A1", topic: "family", vi: "Mẹ tôi là giáo viên.", en: "My mother is a teacher." },
  { id: "a1-04", level: "A1", topic: "food", vi: "Tôi thích ăn phở vào buổi sáng.", en: "I like eating pho in the morning." },
  { id: "a1-05", level: "A1", topic: "daily life", vi: "Bạn có khỏe không?", en: "How are you?" },
  { id: "a2-01", level: "A2", topic: "work", vi: "Tôi thường đi làm bằng xe máy.", en: "I usually go to work by motorbike." },
  { id: "a2-02", level: "A2", topic: "travel", vi: "Chúng tôi sẽ đi Đà Nẵng vào cuối tuần này.", en: "We are going to Da Nang this weekend." },
  { id: "a2-03", level: "A2", topic: "shopping", vi: "Cái áo này bao nhiêu tiền?", en: "How much is this shirt?" },
  { id: "a2-04", level: "A2", topic: "daily life", vi: "Tôi quên mang ô nên bị ướt hết.", en: "I forgot to bring an umbrella, so I got soaked." },
  { id: "a2-05", level: "A2", topic: "health", vi: "Bạn nên uống nhiều nước hơn.", en: "You should drink more water." },
  { id: "b1-01", level: "B1", topic: "work", vi: "Cuộc họp đã bị hoãn đến thứ Năm tuần sau.", en: "The meeting has been postponed until next Thursday." },
  { id: "b1-02", level: "B1", topic: "education", vi: "Nếu tôi có nhiều thời gian hơn, tôi sẽ học thêm tiếng Nhật.", en: "If I had more time, I would also learn Japanese." },
  { id: "b1-03", level: "B1", topic: "society", vi: "Giao thông ở Hà Nội vào giờ cao điểm rất đông.", en: "Traffic in Hanoi during rush hour is very heavy." },
  { id: "b1-04", level: "B1", topic: "work", vi: "Tôi đã làm việc ở công ty này được ba năm.", en: "I have worked at this company for three years." },
  { id: "b1-05", level: "B1", topic: "daily life", vi: "Cô ấy vừa mới chuyển đến đây nên chưa quen đường.", en: "She just moved here, so she does not know the roads yet." },
  { id: "b2-01", level: "B2", topic: "society", vi: "Mặc dù giá nhà tăng cao, nhiều người trẻ vẫn muốn mua nhà ở thành phố.", en: "Although housing prices have risen sharply, many young people still want to buy a home in the city." },
  { id: "b2-02", level: "B2", topic: "work", vi: "Dự án đã hoàn thành đúng hạn nhờ sự nỗ lực của cả nhóm.", en: "The project was completed on time thanks to the whole team's effort." },
  { id: "b2-03", level: "B2", topic: "environment", vi: "Chúng ta cần giảm sử dụng túi nhựa để bảo vệ môi trường.", en: "We need to reduce plastic bag use to protect the environment." },
  { id: "b2-04", level: "B2", topic: "education", vi: "Việc học một ngôn ngữ mới đòi hỏi sự kiên nhẫn và luyện tập hàng ngày.", en: "Learning a new language requires patience and daily practice." },
  { id: "b2-05", level: "B2", topic: "health", vi: "Bác sĩ khuyên anh ấy nên tập thể dục ít nhất ba lần một tuần.", en: "The doctor advised him to exercise at least three times a week." },
];

export const TOPICS = Array.from(new Set(sentences.map((s) => s.topic))).sort();

export function pickRandom(opts: { exclude?: string | string[]; difficulty?: Difficulty } = {}): SentencePair {
  const { exclude, difficulty = "all" } = opts;
  const excluded = new Set(Array.isArray(exclude) ? exclude : exclude ? [exclude] : []);
  let pool = difficulty === "all" ? sentences : sentences.filter((s) => s.level === difficulty);
  if (pool.length === 0) pool = sentences;
  // Avoid recently seen sentences while at least a few candidates remain.
  const fresh = pool.filter((s) => !excluded.has(s.id));
  if (fresh.length >= Math.min(3, pool.length)) pool = fresh;
  return pool[Math.floor(Math.random() * pool.length)];
}
