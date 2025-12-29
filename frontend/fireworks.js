// White fireworks celebration effect
export function triggerFireworks() {
  const fireworksContainer = document.createElement('div');
  fireworksContainer.id = 'fireworks-container';
  document.body.appendChild(fireworksContainer);
  
  const fireworkCount = 8; // Number of fireworks bursts
  const particlesPerFirework = 30;
  
  for (let i = 0; i < fireworkCount; i++) {
    setTimeout(() => {
      createFirework(fireworksContainer, particlesPerFirework);
    }, i * 200); // Stagger the fireworks
  }
  
  // Clean up after animation
  setTimeout(() => {
    if (fireworksContainer.parentElement) {
      fireworksContainer.remove();
    }
  }, 5000);
}

function createFirework(container, particleCount) {
  // Random position on screen
  const x = Math.random() * window.innerWidth;
  const y = Math.random() * (window.innerHeight * 0.6) + window.innerHeight * 0.2; // Upper 60% of screen
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    
    // Random angle and velocity
    const angle = (Math.PI * 2 * i) / particleCount;
    const velocity = 2 + Math.random() * 3;
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity;
    
    // Random size
    const size = 3 + Math.random() * 4;
    
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.setProperty('--vx', vx + 'px');
    particle.style.setProperty('--vy', vy + 'px');
    particle.style.animationDelay = Math.random() * 0.3 + 's';
    
    container.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
      if (particle.parentElement) {
        particle.remove();
      }
    }, 2000);
  }
}

