// Loading screen with cute penguin GIF - only shows on first visit
// To test: localStorage.removeItem('pactory-has-visited') in console
export function initLoadingScreen() {
  // Check if user has visited before
  const hasVisited = localStorage.getItem('pactory-has-visited');
  
  if (hasVisited) {
    // User has visited before, skip loading screen
    return;
  }
  
  // Debug log
  console.log('🐧 Showing loading screen - first visit!');
  
  // Mark as visited immediately to prevent double-showing
  localStorage.setItem('pactory-has-visited', 'true');
  
  // Create loading screen element immediately
  const loader = document.createElement('div');
  loader.id = 'loading-screen';
  loader.innerHTML = `
    <div class="loader-content">
      <div class="penguin-container">
        <img src="./assets/images/pengu-snow-dance.gif" alt="Dancing Penguin" class="penguin-gif" />
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
      </div>
      <div class="loader-text">Welcome to Pactory!</div>
      <div class="loader-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  
  // Insert at the very beginning of body
  if (document.body) {
    document.body.insertBefore(loader, document.body.firstChild);
  } else {
    // If body isn't ready, wait for it
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertBefore(loader, document.body.firstChild);
    });
  }
  
  // Hide loading screen when page is loaded
  const hideLoader = () => {
    setTimeout(() => {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
      }, 500);
    }, 1500); // Show for 1.5 seconds for first-time users
  };
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
    document.addEventListener('DOMContentLoaded', hideLoader);
  }
}

// Enhanced sparkles with mouse interaction
const sparkles = [];
let sparklesInitialized = false;
let animationFrameId = null;

// Cursor-following background effect - always active
export function initCursorBackground() {
  // Check if already initialized
  if (document.getElementById('cursor-background')) {
    // But still ensure sparkles are created if they weren't
    if (!sparklesInitialized) {
      createSparkles();
    }
    return;
  }
  
  const cursorBg = document.createElement('div');
  cursorBg.id = 'cursor-background';
  
  // Add to body when ready
  const addToBody = () => {
    if (document.body && !cursorBg.parentElement) {
      document.body.appendChild(cursorBg);
    }
  };
  
  if (document.body) {
    addToBody();
  } else {
    document.addEventListener('DOMContentLoaded', addToBody);
  }
  
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;
  
  // Track mouse movement
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    // Push sparkles away from cursor
    sparkles.forEach(sparkle => {
      if (!sparkle.element || !sparkle.element.parentElement) return;
      
      const rect = sparkle.element.getBoundingClientRect();
      const sparkleX = rect.left + rect.width / 2;
      const sparkleY = rect.top + rect.height / 2;
      
      const dx = sparkleX - mouseX;
      const dy = sparkleY - mouseY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If sparkle is close to cursor, push it away
      if (distance < 100) {
        const force = (100 - distance) / 100;
        sparkle.vx = (sparkle.vx || 0) + (dx / distance) * force * 0.5;
        sparkle.vy = (sparkle.vy || 0) + (dy / distance) * force * 0.5;
      }
    });
  });
  
  // Smooth animation loop for cursor light
  function animateCursor() {
    // Smooth interpolation for lag effect
    currentX += (mouseX - currentX) * 0.08;
    currentY += (mouseY - currentY) * 0.08;
    
    // Convert to percentage and center
    const x = (currentX / window.innerWidth) * 100;
    const y = (currentY / window.innerHeight) * 100;
    
    // Apply with offset to create subtle parallax
    if (cursorBg.parentElement) {
      cursorBg.style.backgroundPosition = `${x}% ${y}%`;
    }
    
    requestAnimationFrame(animateCursor);
  }
  
  animateCursor();
  
  // Create many more interactive sparkles
  function createSparkles() {
    if (!document.body) {
      setTimeout(createSparkles, 100);
      return;
    }
    
    // Don't recreate if already initialized
    if (sparklesInitialized && sparkles.length > 0) {
      return;
    }
    
    // Clear existing sparkles array and remove old elements
    sparkles.forEach(sparkle => {
      if (sparkle.element && sparkle.element.parentElement) {
        sparkle.element.remove();
      }
    });
    sparkles.length = 0;
    
    const sparkleCount = 25; // Increased from 8
    
    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle interactive-sparkle';
      
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      
      sparkle.style.left = x + 'px';
      sparkle.style.top = y + 'px';
      sparkle.style.animationDelay = Math.random() * 8 + 's';
      sparkle.style.animationDuration = (6 + Math.random() * 4) + 's';
      
      // Store sparkle data for interaction
      const sparkleData = {
        element: sparkle,
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        baseX: x,
        baseY: y,
        time: Math.random() * Math.PI * 2
      };
      
      sparkles.push(sparkleData);
      document.body.appendChild(sparkle);
    }
    
    sparklesInitialized = true;
    
    // Animate sparkles with physics
    function animateSparkles() {
      sparkles.forEach(sparkle => {
        if (!sparkle.element || !sparkle.element.parentElement) return;
        
        // Add some floating motion
        sparkle.time += 0.02;
        sparkle.x += sparkle.vx;
        sparkle.y += sparkle.vy;
        
        // Add gentle floating
        sparkle.x += Math.sin(sparkle.time) * 0.3;
        sparkle.y += Math.cos(sparkle.time * 0.7) * 0.3;
        
        // Damping
        sparkle.vx *= 0.98;
        sparkle.vy *= 0.98;
        
        // Boundary check
        if (sparkle.x < 0 || sparkle.x > window.innerWidth) sparkle.vx *= -0.5;
        if (sparkle.y < 0 || sparkle.y > window.innerHeight) sparkle.vy *= -0.5;
        
        // Keep in bounds
        sparkle.x = Math.max(0, Math.min(window.innerWidth, sparkle.x));
        sparkle.y = Math.max(0, Math.min(window.innerHeight, sparkle.y));
        
        sparkle.element.style.left = sparkle.x + 'px';
        sparkle.element.style.top = sparkle.y + 'px';
      });
      
      animationFrameId = requestAnimationFrame(animateSparkles);
    }
    
    // Cancel any existing animation
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animateSparkles();
  }
  
  // Wait a bit for page to load, then create sparkles
  if (document.body) {
    setTimeout(createSparkles, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(createSparkles, 500);
    });
  }
  
  // Also try creating sparkles immediately if body exists
  if (document.body) {
    createSparkles();
  }
}


