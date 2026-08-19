export type Vec2 = { x: number; y: number };

/** Um passo de mola amortecida -- usado pelos efeitos magnéticos (botão, navbar). */
export function springStep(position: number, velocity: number, target: number) {
  const SPRING_STIFFNESS = 0.15;
  const SPRING_DAMPING = 0.75;
  const nextVelocity = (velocity + (target - position) * SPRING_STIFFNESS) * SPRING_DAMPING;
  return { position: position + nextVelocity, velocity: nextVelocity };
}
