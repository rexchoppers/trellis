// Up from 1 December until Twelfth Night on 6 January, by this computer's clock. November is on too for now, to see them early.
export function christmas(now = new Date()) {
  const month = now.getMonth();
  return month === 10 || month === 11 || (month === 0 && now.getDate() <= 6);
}
