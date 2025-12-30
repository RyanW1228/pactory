// Fireworks animation for successful pact creation
export function showFireworks() {
  const container = document.getElementById('fireworks-container');
  if (!container) return;

  // Create multiple firework bursts
  const burstCount = 8;
  const particlesPerBurst = 20;

  for (let i = 0; i < burstCount; i++) {
    setTimeout(() => {
      createFireworkBurst(
        container,
        Math.random() * window.innerWidth,
        Math.random() * (window.innerHeight * 0.6) + window.innerHeight * 0.2,
        particlesPerBurst
      );
    }, i * 150); // Stagger the bursts
  }
}

function createFireworkBurst(container, x, y, particleCount) {
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    
    const angle = (Math.PI * 2 * i) / particleCount;
    const velocity = 2 + Math.random() * 3;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity;
    
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.setProperty('--vx', vx);
    particle.style.setProperty('--vy', vy);
    
    container.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
      if (particle.parentElement) {
        particle.remove();
      }
    }, 2000);
  }
}


