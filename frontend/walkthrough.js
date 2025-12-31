// Walkthrough/Demo System
let currentStep = 0;
let walkthroughSteps = [];
let overlay = null;
let highlight = null;
let tooltip = null;
let isActive = false;

// Define walkthrough steps for homepage - rewritten from scratch
const homepageSteps = [
  {
    id: 'welcome',
    title: 'Welcome to Pactory!',
    content: 'Pactory helps creators and sponsors create transparent payment agreements. Let\'s take a quick tour!',
    element: null,
    position: 'center',
    showStartButton: true
  },
  {
    id: 'wallet-info',
    title: 'Wallet Information',
    content: 'Here you can see your connected wallet address and balances. Connect your wallet to get started!',
    element: '.card',
    position: 'bottom'
  },
  {
    id: 'environment',
    title: 'Environment Settings',
    content: 'Switch between Testing and Production environments. In Testing mode, you can mint Mock MNEE tokens for testing.',
    element: '.environment-section',
    position: 'bottom'
  },
  {
    id: 'view-toggle',
    title: 'View Mode Toggle',
    content: 'Switch between Sponsor and Creator views. This determines which pacts you see and how you interact with them.',
    element: '.view-toggle',
    position: 'bottom'
  },
  {
    id: 'actions',
    title: 'Main Actions',
    content: 'Connect your wallet to get started, then view your pacts or create new ones. All actions require a connected wallet.',
    element: '#connectButton',
    position: 'bottom'
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    content: 'You now know the basics of Pactory. Start by connecting your wallet, then explore creating or viewing pacts. Happy pact-making! 🎉',
    element: null,
    position: 'center',
    showFinishButton: true
  }
];

// Define walkthrough steps for pacts dashboard
const dashboardSteps = [
  {
    id: 'dashboard-welcome',
    title: 'Pacts Dashboard',
    content: 'This is where you manage all your pacts. Let\'s explore the key features!',
    element: null,
    position: 'center',
    showStartButton: true
  },
  {
    id: 'view-switch',
    title: 'Switch Views',
    content: 'Toggle between Sponsor and Creator views to see different pact categories and actions available to you.',
    element: '.view-toggle',
    position: 'bottom'
  },
  {
    id: 'propose-pact',
    title: 'Create New Pact',
    content: 'Click here to propose a new pact. You\'ll set up payment milestones, duration, and terms.',
    element: '#proposePactButton',
    position: 'top'
  },
  {
    id: 'pact-sections',
    title: 'Pact Categories',
    content: 'Your pacts are organized into sections like Active, Awaiting Review, and Archive. Each section shows pacts in different stages.',
    element: '#sectionsContainer',
    position: 'top'
  },
  {
    id: 'dashboard-complete',
    title: 'Dashboard Tour Complete!',
    content: 'You\'re ready to manage your pacts! Try creating a new pact or exploring your existing ones.',
    element: null,
    position: 'center',
    showFinishButton: true
  }
];

// Define walkthrough steps for pact creation page
const pactorySteps = [
  {
    id: 'pactory-welcome',
    title: 'Create Your Pact',
    content: 'This is where you create a new pact. Let\'s walk through the process!',
    element: null,
    position: 'center',
    showStartButton: true
  },
  {
    id: 'role-toggle',
    title: 'Choose Your Role',
    content: 'Select whether you\'re creating this pact as a Sponsor or Creator. This determines your responsibilities.',
    element: '.role-toggle',
    position: 'bottom'
  },
  {
    id: 'pact-name',
    title: 'Pact Name',
    content: 'Give your pact a descriptive name. This helps both parties identify the agreement.',
    element: '#pactName',
    position: 'bottom'
  },
  {
    id: 'counterparty',
    title: 'Counterparty Address',
    content: 'Enter the wallet address of the other party (Creator if you\'re Sponsor, or Sponsor if you\'re Creator).',
    element: '#counterpartyInput',
    position: 'bottom'
  },
  {
    id: 'milestones',
    title: 'Payment Milestones',
    content: 'Set up progress-based payments with view thresholds. Each milestone pays out when the view count is reached.\n\nThere are two payment types:\n• Progress Pay: Milestone-based payments that pay out incrementally as view thresholds are reached\n• All-or-Nothing Pay: Rewards that only pay out if the final view threshold is met',
    element: '#progressPayBody',
    position: 'right'
  },
  {
    id: 'graph',
    title: 'Payout Visualization',
    content: 'This graph shows your total payout structure combining both payment types. Adjust milestones and rewards above to see how the payout curve changes in real-time.',
    element: '#payoutGraph',
    position: 'right'
  },
  {
    id: 'pactory-complete',
    title: 'Ready to Create!',
    content: 'Fill in all the details and click "Send for Review" when ready. The other party will be able to review and negotiate.',
    element: null,
    position: 'center',
    showFinishButton: true
  }
];

function getStepsForPage() {
  const path = window.location.pathname;
  const filename = window.location.pathname.split('/').pop() || '';
  
  // Check for specific pages
  if (path.includes('pacts-dashboard') || filename === 'pacts-dashboard.html') {
    return dashboardSteps;
  } else if (path.includes('pactory') || filename === 'pactory.html') {
    return pactorySteps;
  } else {
    // Default to homepage (index.html or root)
    return homepageSteps;
  }
}

function createOverlay() {
  if (overlay) return overlay;
  
  overlay = document.createElement('div');
  overlay.className = 'walkthrough-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

function createHighlight() {
  if (highlight) return highlight;
  
  highlight = document.createElement('div');
  highlight.className = 'walkthrough-highlight';
  document.body.appendChild(highlight);
  return highlight;
}

function createTooltip() {
  if (tooltip) return tooltip;
  
  tooltip = document.createElement('div');
  tooltip.className = 'walkthrough-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

function getElementPosition(element) {
  if (!element) return null;
  
  const rect = element.getBoundingClientRect();
  // Use viewport coordinates (getBoundingClientRect) for proper positioning
  // These are relative to the viewport, which is what we need for fixed positioning
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right
  };
}

function positionHighlight(element) {
  if (!highlight || !element) {
    if (highlight) highlight.style.display = 'none';
    return;
  }
  
  const pos = getElementPosition(element);
  if (!pos || pos.width === 0 || pos.height === 0) {
    highlight.style.display = 'none';
    return;
  }
  
  // Check if element is actually visible
  const computedStyle = window.getComputedStyle(element);
  if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
    highlight.style.display = 'none';
    return;
  }
  
  highlight.style.display = 'block';
  // Use fixed positioning with viewport coordinates
  highlight.style.position = 'fixed';
  highlight.style.top = `${pos.top - 4}px`;
  highlight.style.left = `${pos.left - 4}px`;
  highlight.style.width = `${pos.width + 8}px`;
  highlight.style.height = `${pos.height + 8}px`;
  
  // Ensure the highlighted element is clickable by raising its z-index
  if (element) {
    const originalZIndex = element.style.zIndex || computedStyle.zIndex || 'auto';
    element.style.zIndex = '10001';
    element.setAttribute('data-original-z-index', originalZIndex);
  }
}

function positionTooltip(step, element) {
  if (!tooltip) return;
  
  const stepNum = currentStep + 1;
  const totalSteps = walkthroughSteps.length;
  
  // Replace newlines with <br> tags for multi-line content
  const formattedContent = step.content.replace(/\n/g, '<br>');
  
  let tooltipHTML = `
    <h3>
      <span class="step-indicator">${stepNum} / ${totalSteps}</span>
      ${step.title}
    </h3>
    <p>${formattedContent}</p>
    <div class="tooltip-actions">
  `;
  
  if (step.showStartButton) {
    tooltipHTML += `<button class="btn-next" onclick="window.walkthroughNext()">Start Tour</button>`;
  } else if (step.showFinishButton) {
    tooltipHTML += `
      <button class="btn-prev" onclick="window.walkthroughPrev()">Previous</button>
      <button class="btn-finish" onclick="window.finishWalkthrough()">Finish</button>
    `;
  } else {
    // Check if this is the last step (not using showFinishButton)
    const isLastStep = currentStep === totalSteps - 1;
    tooltipHTML += `
      <button class="btn-skip" onclick="window.finishWalkthrough()">Skip Tour</button>
      ${currentStep > 0 ? '<button class="btn-prev" onclick="window.walkthroughPrev()">Previous</button>' : ''}
      <button class="${isLastStep ? 'btn-finish' : 'btn-next'}" onclick="${isLastStep ? 'window.finishWalkthrough()' : 'window.walkthroughNext()'}">${isLastStep ? 'Finish' : 'Next'}</button>
    `;
  }
  
  tooltipHTML += '</div>';
  tooltip.innerHTML = tooltipHTML;
  
  // Position tooltip
  if (!element || step.position === 'center') {
    // Center tooltip
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    tooltip.className = 'walkthrough-tooltip';
    tooltip.style.visibility = 'visible';
  } else {
    // Get fresh element position
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Element not visible, try again after a short delay
      setTimeout(() => positionTooltip(step, element), 100);
      return;
    }
    
    const spacing = 20;
    let top, left, arrowClass;
    
    // Calculate initial position based on step.position
    switch (step.position) {
      case 'top':
        top = rect.top - spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, -100%)';
        arrowClass = 'tooltip-bottom';
        break;
      case 'bottom':
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, 0)';
        arrowClass = 'tooltip-top';
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - spacing;
        tooltip.style.transform = 'translate(-100%, -50%)';
        arrowClass = 'tooltip-right';
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + spacing;
        tooltip.style.transform = 'translate(0, -50%)';
        arrowClass = 'tooltip-left';
        break;
      default:
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, 0)';
        arrowClass = 'tooltip-top';
    }
    
    // Set initial position (hidden) to measure tooltip
    tooltip.style.visibility = 'hidden';
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.className = `walkthrough-tooltip ${arrowClass}`;
    
    // Force layout recalculation
    void tooltip.offsetHeight;
    
    // Get actual tooltip dimensions
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Recalculate vertical centering for right/left positions using actual tooltip height
    if ((step.position === 'right' || step.position === 'left') && rect) {
      top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
    }
    
    // Keep tooltip within viewport bounds
    const padding = 20;
    if (left < padding) left = padding;
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipRect.height > window.innerHeight - padding) {
      top = window.innerHeight - tooltipRect.height - padding;
    }
    
    // Apply final position and make visible
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.visibility = 'visible';
  }
}

function showStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= walkthroughSteps.length) {
    finishWalkthrough();
    return;
  }
  
  currentStep = stepIndex;
  const step = walkthroughSteps[stepIndex];
  
  createOverlay();
  createHighlight();
  createTooltip();
  
  let element = null;
  if (step.element) {
    element = document.querySelector(step.element);
    if (element) {
      // Check if element is visible
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      const isVisible = rect.width > 0 && rect.height > 0 && 
                       computedStyle.display !== 'none' &&
                       computedStyle.visibility !== 'hidden';
      
      if (!isVisible || rect.top < -100 || rect.bottom > window.innerHeight + 100) {
        // Element exists but not visible, scroll it into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait for scroll to complete (reduced from 400ms to 300ms)
        setTimeout(() => {
          if (isActive) { // Check if still active before positioning
            positionHighlight(element);
            positionTooltip(step, element);
          }
        }, 300);
      } else {
        // Element is already visible, position immediately
        positionHighlight(element);
        positionTooltip(step, element);
      }
    } else {
      // Element not found, show tooltip without highlight
      positionTooltip(step, null);
    }
  } else {
    positionTooltip(step, null);
  }
  
  if (!element) {
    if (highlight) highlight.style.display = 'none';
  }
}

export function startWalkthrough() {
  if (isActive) return;
  
  // Clean up any existing walkthrough elements first
  finishWalkthrough();
  
  isActive = true;
  walkthroughSteps = getStepsForPage();
  currentStep = 0;
  
  // Hide start tour button if visible
  const startBtn = document.getElementById('startTourBtn');
  if (startBtn) {
    startBtn.style.display = 'none';
    startBtn.style.visibility = 'hidden';
  }
  
  // Small delay to ensure cleanup is complete
  setTimeout(() => {
    if (isActive) {
      showStep(0);
    }
  }, 50);
}

export function walkthroughNext() {
  // Prevent multiple rapid clicks that cause lag
  if (!isActive) return;
  
  if (currentStep < walkthroughSteps.length - 1) {
    // Small delay to prevent lag/shaking
    setTimeout(() => {
      showStep(currentStep + 1);
    }, 100);
  } else {
    finishWalkthrough();
  }
}

export function walkthroughPrev() {
  if (currentStep > 0) {
    showStep(currentStep - 1);
  }
}

export function finishWalkthrough() {
  if (!isActive && overlay === null && highlight === null && tooltip === null) {
    // Already cleaned up, nothing to do
    return;
  }
  
  isActive = false;
  currentStep = 0;
  
  // Reset any z-index changes on elements
  const allElements = document.querySelectorAll('[data-original-z-index]');
  allElements.forEach(el => {
    const originalZIndex = el.getAttribute('data-original-z-index');
    if (originalZIndex && originalZIndex !== 'auto' && originalZIndex !== '') {
      el.style.zIndex = originalZIndex;
    } else {
      el.style.zIndex = '';
    }
    el.removeAttribute('data-original-z-index');
  });
  
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  if (highlight) {
    highlight.remove();
    highlight = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
  
  // Mark walkthrough as completed for this page
  const path = window.location.pathname;
  const pageKey = path.includes('pacts-dashboard') ? 'dashboard' : 
                  path.includes('pactory') ? 'pactory' : 'homepage';
  localStorage.setItem(`walkthrough-completed-${pageKey}`, 'true');
  
  // Show start tour button again
  const startBtn = document.getElementById('startTourBtn');
  if (startBtn) {
    startBtn.style.display = 'block';
    startBtn.style.visibility = 'visible';
    startBtn.style.opacity = '1';
  }
  
  // Clear walkthroughSteps to prevent any lingering references
  walkthroughSteps = [];
  currentStep = 0;
}

export function initWalkthrough() {
  // Wait for body to be available
  const ensureBody = () => {
    if (!document.body) {
      setTimeout(ensureBody, 50);
      return;
    }
    
    // Check if walkthrough should auto-start (first visit)
    const path = window.location.pathname;
    const pageKey = path.includes('pacts-dashboard') ? 'dashboard' : 
                    path.includes('pactory') ? 'pactory' : 'homepage';
    const hasCompleted = localStorage.getItem(`walkthrough-completed-${pageKey}`);
    
    // Create start tour button
    let startBtn = document.getElementById('startTourBtn');
    if (!startBtn) {
      startBtn = document.createElement('button');
      startBtn.id = 'startTourBtn';
      startBtn.className = 'start-tour-btn';
      startBtn.innerHTML = 'Start Tour';
      startBtn.onclick = () => startWalkthrough();
      startBtn.style.display = 'block';
      startBtn.style.visibility = 'visible';
      startBtn.style.opacity = '1';
      document.body.appendChild(startBtn);
      console.log('Start Tour button created');
    } else {
      // Ensure it's visible
      startBtn.style.display = 'block';
      startBtn.style.visibility = 'visible';
      startBtn.style.opacity = '1';
    }
    
    // Auto-start on first visit (optional - can be removed if you don't want auto-start)
    // if (!hasCompleted) {
    //   setTimeout(() => startWalkthrough(), 1000);
    // }
  };
  
  ensureBody();
}

// Make functions available globally for onclick handlers
window.walkthroughNext = walkthroughNext;
window.walkthroughPrev = walkthroughPrev;
window.finishWalkthrough = finishWalkthrough;
window.startWalkthrough = startWalkthrough;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initWalkthrough, 100);
  });
} else {
  setTimeout(initWalkthrough, 100);
}

