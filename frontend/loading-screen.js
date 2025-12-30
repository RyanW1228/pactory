// Loading screen with cute penguin GIF - only shows on first visit
// To test again: localStorage.removeItem('pactory-has-visited')
// Loading screen - show ONLY on first visit
// Reset with: localStorage.removeItem('pactory-has-visited')
export function initLoadingScreen() {
  const hasVisited = localStorage.getItem("pactory-has-visited");
  if (hasVisited) {
    // User has visited before → immediately reveal UI
    const app = document.querySelector(".container");
    if (app) app.style.visibility = "visible";
    return;
  }

  console.log("🐧 Showing loading screen (first visit)");

  // --- CREATE LOADER ---
  const loader = document.createElement("div");
  loader.id = "loading-screen";
  loader.innerHTML = `
    <div class="loader-content">
      <div class="penguin-container">
        <img src="./assets/images/pengu-snow-dance.gif" class="penguin-gif" />
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
        <div class="snowflake">❄</div>
      </div>
      <div class="loader-text">Welcome to Pactory!</div>
      <div class="loader-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  // --- INSERT LOADER IMMEDIATELY ---
  const insertLoader = () => {
    if (!document.body) return;

    document.body.insertBefore(loader, document.body.firstChild);

    // Mark as visited ONLY after showing
    localStorage.setItem("pactory-has-visited", "true");

    // Hide loader after fixed time
    setTimeout(() => {
      loader.style.opacity = "0";

      setTimeout(() => {
        loader.remove();

        // NOW reveal the UI
        const app = document.querySelector(".container");
        if (app) app.style.visibility = "visible";
      }, 500);
    }, 1500);
  };

  if (document.body) {
    insertLoader();
  } else {
    document.addEventListener("DOMContentLoaded", insertLoader, { once: true });
  }
}

// Secondary loading screen - shows while content loads (every page load)
export function initSecondaryLoadingScreen() {
  // Don't show if first-visit loading screen is showing
  const hasVisited = localStorage.getItem("pactory-has-visited");
  if (!hasVisited) {
    // First visit - main loading screen will handle it
    return;
  }

  // Hide content initially to prevent flash
  const hideContent = () => {
    const containers = document.querySelectorAll(".container");
    containers.forEach(container => {
      if (container) {
        container.style.visibility = "hidden";
        container.style.opacity = "0";
      }
    });
  };

  // Show content
  const showContent = () => {
    if (document.body) {
      document.body.classList.add("content-loaded");
    }
    const containers = document.querySelectorAll(".container");
    containers.forEach(container => {
      if (container) {
        container.style.visibility = "visible";
        container.style.opacity = "1";
      }
    });
  };

  // Hide content immediately
  hideContent();

  // Track loading start time for minimum display duration
  const loadStartTime = Date.now();
  const MIN_DISPLAY_TIME = 1000; // 1 second minimum

  // Create secondary loader
  const createLoader = () => {
    if (document.getElementById("secondary-loading-screen")) return;

    const secondaryLoader = document.createElement("div");
    secondaryLoader.id = "secondary-loading-screen";
    secondaryLoader.innerHTML = `
      <div class="loader-content">
        <div class="penguin-container-secondary">
          <img src="./assets/images/pengu-dancy.gif" class="penguin-gif-secondary" alt="Dancing Penguin" />
        </div>
        <div class="loader-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    if (document.body) {
      document.body.insertBefore(secondaryLoader, document.body.firstChild);
    } else {
      // Use inline script to insert immediately
      const script = document.createElement("script");
      script.textContent = `
        (function() {
          if (document.getElementById('secondary-loading-screen')) return;
          const div = document.createElement('div');
          div.id = 'secondary-loading-screen';
          div.innerHTML = \`
            <div class="loader-content">
              <div class="penguin-container-secondary">
                <img src="./assets/images/pengu-dancy.gif" class="penguin-gif-secondary" alt="Dancing Penguin" />
              </div>
              <div class="loader-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          \`;
          if (document.body) {
            document.body.insertBefore(div, document.body.firstChild);
          } else {
            document.addEventListener('DOMContentLoaded', function() {
              document.body.insertBefore(div, document.body.firstChild);
            }, { once: true });
          }
        })();
      `;
      document.head.appendChild(script);
    }
  };

  // Create loader immediately
  createLoader();

  // Also try creating it when body is ready
  if (document.body) {
    createLoader();
  } else {
    document.addEventListener("DOMContentLoaded", createLoader, { once: true });
  }

  // Hide secondary loader when page is fully loaded (with minimum display time)
  const hideSecondaryLoader = () => {
    const elapsedTime = Date.now() - loadStartTime;
    const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);
    
    setTimeout(() => {
      const loader = document.getElementById("secondary-loading-screen");
      if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => {
          if (loader.parentElement) {
            loader.remove();
          }
          // Reveal content
          showContent();
        }, 300);
      } else {
        // If loader wasn't found, just reveal content
        showContent();
      }
    }, remainingTime);
  };

  // Wait for full page load
  if (document.readyState === "complete") {
    // Page already loaded - but still respect minimum time
    hideSecondaryLoader();
  } else {
    window.addEventListener("load", hideSecondaryLoader, { once: true });
    // Fallback - hide after a reasonable time (but still respect minimum)
    setTimeout(hideSecondaryLoader, 3000);
  }
}

// Enhanced sparkles with mouse interaction
const sparkles = [];
let sparklesInitialized = false;
let animationFrameId = null;

// Cursor-following background effect - always active
export function initCursorBackground() {
  // Check if already initialized
  if (document.getElementById("cursor-background")) {
    // But still ensure sparkles are created if they weren't
    if (!sparklesInitialized) {
      createSparkles();
    }
    return;
  }

  const cursorBg = document.createElement("div");
  cursorBg.id = "cursor-background";

  // Add to body when ready
  const addToBody = () => {
    if (document.body && !cursorBg.parentElement) {
      document.body.appendChild(cursorBg);
    }
  };

  if (document.body) {
    addToBody();
  } else {
    document.addEventListener("DOMContentLoaded", addToBody);
  }

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;

  // Track mouse movement
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Push sparkles away from cursor
    sparkles.forEach((sparkle) => {
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
    sparkles.forEach((sparkle) => {
      if (sparkle.element && sparkle.element.parentElement) {
        sparkle.element.remove();
      }
    });
    sparkles.length = 0;

    const sparkleCount = 25; // Increased from 8

    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement("div");
      sparkle.className = "sparkle interactive-sparkle";

      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;

      sparkle.style.left = x + "px";
      sparkle.style.top = y + "px";
      sparkle.style.animationDelay = Math.random() * 8 + "s";
      sparkle.style.animationDuration = 6 + Math.random() * 4 + "s";

      // Store sparkle data for interaction
      const sparkleData = {
        element: sparkle,
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        baseX: x,
        baseY: y,
        time: Math.random() * Math.PI * 2,
      };

      sparkles.push(sparkleData);
      document.body.appendChild(sparkle);
    }

    sparklesInitialized = true;

    // Animate sparkles with physics
    function animateSparkles() {
      sparkles.forEach((sparkle) => {
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

        sparkle.element.style.left = sparkle.x + "px";
        sparkle.element.style.top = sparkle.y + "px";
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
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(createSparkles, 500);
    });
  }

  // Also try creating sparkles immediately if body exists
  if (document.body) {
    createSparkles();
  }
}
