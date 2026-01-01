// Walkthrough/Demo System
let currentStep = 0;
let walkthroughSteps = [];
let overlay = null;
let highlight = null;
let tooltip = null;
let isActive = false;
let scrollHandler = null;
let originalBodyOverflow = null;
let resizeObserver = null;
let currentStepElement = null;
let currentStepData = null;

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
    position: 'top'
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

// Define walkthrough steps for pact view page
const pactViewSteps = [
  {
    id: 'pact-view-welcome',
    title: 'Pact Details',
    content: 'This page shows all the details of your pact. Let\'s explore the key information and actions available!',
    element: '#title',
    position: 'right',
    showStartButton: true
  },
  {
    id: 'pact-info',
    title: 'Pact Information',
    content: 'Here you can see the pact name, status, parties involved, duration, and payment structure. Review all details carefully.',
    element: '#content',
    position: 'right'
  },
  {
    id: 'active-panel',
    title: 'Active Pact Status',
    content: 'If your pact is active, you\'ll see real-time stats here: video views, earned amounts, and time remaining. Click "Refresh Views" to update the latest numbers.',
    element: '#activePanel',
    position: 'right',
    conditional: () => {
      const panel = document.getElementById('activePanel');
      return panel && panel.style.display !== 'none' && window.getComputedStyle(panel).display !== 'none';
    }
  },
  {
    id: 'video-link',
    title: 'Video Link',
    content: 'The creator can input the video link here once the pact is created. This link is used to track views and calculate earnings from TikTok, Instagram, or YouTube Shorts.',
    element: '#content',
    position: 'right'
  },
  {
    id: 'actions',
    title: 'Available Actions',
    content: 'Depending on your role and the pact status, you may see different action buttons:\n\n• Input Video Link (Creator): Add the video URL\n• Approve and Fund (Sponsor): Lock funds to activate the pact\n• Negotiate: Propose changes to the pact\n• Accept/Reject: Review and respond to pact proposals\n• Refresh Views: Update view counts from the video platform\n• Claim: Withdraw unlocked earnings to your wallet',
    element: '#content',
    position: 'right'
  },
  {
    id: 'pact-view-complete',
    title: 'You\'re All Set!',
    content: 'You now understand how to view and interact with pacts. Use the available actions based on your role and the pact status.',
    element: '#content',
    position: 'right',
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
  } else if (path.includes('pact-view') || filename === 'pact-view.html') {
    return pactViewSteps;
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
  // But don't interfere with hover states
  if (element) {
    const originalZIndex = element.style.zIndex || computedStyle.zIndex || 'auto';
    // Only set z-index if it's not already high enough
    if (parseInt(computedStyle.zIndex) < 10001) {
      element.style.zIndex = '10001';
      element.setAttribute('data-original-z-index', originalZIndex);
    }
  }
}

function positionTooltip(step, element) {
  if (!tooltip) return;
  
  const stepNum = currentStep + 1;
  const totalSteps = walkthroughSteps.length;
  
  // Get content - use dynamic content if available, otherwise use static content
  let content = step.content;
  if (step.getContent && typeof step.getContent === 'function') {
    content = step.getContent();
  }
  
  // Replace newlines with <br> tags for multi-line content
  const formattedContent = content.replace(/\n/g, '<br>');
  
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
    
    // Increased spacing to prevent arrow from overlapping highlight
    const spacing = 28; // Increased from 20 to account for arrow size (12px) + padding
    let top, left, arrowClass;
    
    // Calculate initial position based on step.position
    // Arrow class name indicates which direction the arrow points FROM the tooltip
    switch (step.position) {
      case 'top':
        // Tooltip above element, arrow points DOWN
        top = rect.top - spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, -100%)';
        arrowClass = 'tooltip-bottom'; // Arrow at bottom of tooltip, points down
        break;
      case 'bottom':
        // Tooltip below element, arrow points UP
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, 0)';
        arrowClass = 'tooltip-top'; // Arrow at top of tooltip, points up
        break;
      case 'left':
        // Tooltip to the left of element, arrow points RIGHT
        top = rect.top + rect.height / 2;
        left = rect.left - spacing;
        tooltip.style.transform = 'translate(-100%, -50%)';
        arrowClass = 'tooltip-right'; // Arrow at right of tooltip, points right
        break;
      case 'right':
        // Tooltip to the right of element, arrow points LEFT
        top = rect.top + rect.height / 2;
        left = rect.right + spacing;
        tooltip.style.transform = 'translate(0, -50%)';
        arrowClass = 'tooltip-left'; // Arrow at left of tooltip, points left
        break;
      default:
        // Default to bottom position
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2;
        tooltip.style.transform = 'translate(-50%, 0)';
        arrowClass = 'tooltip-top'; // Arrow at top of tooltip, points up
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
    // Account for arrow size when calculating bounds
    // Use larger padding when zoomed in to ensure visibility
    const viewportPadding = Math.max(20, window.innerWidth * 0.05); // At least 5% of viewport
    const arrowSize = 24; // Size of arrow (12px border * 2)
    
    // Store original positions for arrow hiding logic
    const originalLeft = left;
    const originalTop = top;
    
    // Ensure tooltip is fully visible, prioritizing keeping it near the element
    if (left < viewportPadding) {
      left = viewportPadding;
      // If tooltip moved significantly, hide arrow to avoid confusion
      if (step.position === 'left' || step.position === 'right') {
        if (Math.abs(left - originalLeft) > 50) {
          arrowClass = ''; // Remove arrow if tooltip was repositioned significantly
        }
      }
    }
    if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - tooltipRect.width - viewportPadding;
      // If tooltip moved significantly, hide arrow to avoid confusion
      if (step.position === 'left' || step.position === 'right') {
        if (Math.abs(left - originalLeft) > 50) {
          arrowClass = ''; // Remove arrow if tooltip was repositioned significantly
        }
      }
    }
    if (top < viewportPadding) {
      top = viewportPadding;
      // If tooltip moved significantly, hide arrow to avoid confusion
      if (step.position === 'top' || step.position === 'bottom') {
        if (Math.abs(top - originalTop) > 50) {
          arrowClass = ''; // Remove arrow if tooltip was repositioned significantly
        }
      }
    }
    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = window.innerHeight - tooltipRect.height - viewportPadding;
      // If tooltip moved significantly, hide arrow to avoid confusion
      if (step.position === 'top' || step.position === 'bottom') {
        if (Math.abs(top - originalTop) > 50) {
          arrowClass = ''; // Remove arrow if tooltip was repositioned significantly
        }
      }
    }
    
    // Update arrow class if it was changed
    tooltip.className = `walkthrough-tooltip ${arrowClass}`;
    
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
  
  // Check conditional steps - skip if condition is false
  if (step.conditional && typeof step.conditional === 'function') {
    if (!step.conditional()) {
      // Skip this step and move to next
      if (stepIndex < walkthroughSteps.length - 1) {
        showStep(stepIndex + 1);
      } else {
        finishWalkthrough();
      }
      return;
    }
  }
  
  createOverlay();
  createHighlight();
  createTooltip();
  
  let element = null;
  if (step.element) {
    // Handle button text matching (e.g., 'button[innerText*="Claim"]')
    if (step.element.includes('innerText')) {
      const match = step.element.match(/button\[innerText\*="([^"]+)"/);
      if (match) {
        const searchText = match[1];
        const buttons = Array.from(document.querySelectorAll('button'));
        element = buttons.find(btn => btn.innerText && btn.innerText.includes(searchText));
      } else {
        element = document.querySelector(step.element);
      }
    } else {
      element = document.querySelector(step.element);
    }
    
    // Special handling for connect button - check if wallet is already connected
    if (step.element === '#connectButton') {
      const connectBtn = document.getElementById('connectButton');
      const logoutBtn = document.getElementById('logoutButton');
      // If connect button doesn't exist, is hidden, OR logout button is visible, wallet is already connected
      const isConnected = !connectBtn || 
                         connectBtn.style.display === 'none' || 
                         window.getComputedStyle(connectBtn).display === 'none' ||
                         (logoutBtn && logoutBtn.style.display !== 'none' && window.getComputedStyle(logoutBtn).display !== 'none');
      
      if (isConnected) {
        // Wallet is connected, show tooltip without highlighting button (no waiting/lag)
        positionTooltip(step, null);
        if (isActive) {
          setupScrollPrevention(step, null);
        }
        if (highlight) highlight.style.display = 'none';
        return; // Skip the rest of the element positioning to avoid lag
      }
    }
    
    if (element) {
      // Always scroll element into center view, regardless of current visibility
      // This ensures elements are visible even when zoomed in
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      
      // Wait for scroll to complete, then check if we need additional adjustment
      setTimeout(() => {
        if (!isActive) return; // Check if still active
        
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        const isVisible = rect.width > 0 && rect.height > 0 && 
                         computedStyle.display !== 'none' &&
                         computedStyle.visibility !== 'hidden';
        
        if (isVisible) {
          // Calculate if element is truly centered
          const viewportCenterY = window.innerHeight / 2;
          const viewportCenterX = window.innerWidth / 2;
          const elementCenterY = rect.top + rect.height / 2;
          const elementCenterX = rect.left + rect.width / 2;
          
          // Calculate scroll adjustments needed to center
          const scrollY = elementCenterY - viewportCenterY;
          const scrollX = elementCenterX - viewportCenterX;
          
          // If element is not well-centered, make a small adjustment
          // We do this before disabling scroll, so it's allowed
          if (Math.abs(scrollY) > 50 || Math.abs(scrollX) > 50) {
            window.scrollBy({
              top: scrollY,
              left: scrollX,
              behavior: 'smooth'
            });
            
            // Wait a bit more for this adjustment
            setTimeout(() => {
              if (isActive) {
                positionHighlight(element);
                positionTooltip(step, element);
                // Now disable scrolling after positioning
                setupScrollPrevention(step, element);
              }
            }, 300);
          } else {
            // Element is well-centered, position immediately
            positionHighlight(element);
            positionTooltip(step, element);
            // Now disable scrolling after positioning
            setupScrollPrevention(step, element);
          }
        } else {
          // Element not visible, try positioning anyway
          positionHighlight(element);
          positionTooltip(step, element);
          setupScrollPrevention(step, element);
        }
      }, 400); // Increased timeout to allow scroll to complete
    } else {
      // Element not found, show tooltip without highlight
      positionTooltip(step, null);
      if (isActive) {
        setupScrollPrevention(step, null);
      }
    }
  } else {
    // No element (center tooltip)
    positionTooltip(step, null);
    if (isActive) {
      setupScrollPrevention(step, null);
    }
  }
  
  if (!element) {
    if (highlight) highlight.style.display = 'none';
  }
}

function setupScrollPrevention(step, element) {
  // Store current step data for repositioning
  currentStepElement = element;
  currentStepData = step;
  
  // Prevent body scrolling
  if (!originalBodyOverflow) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Also prevent scrolling on html element
    document.documentElement.style.overflow = 'hidden';
  }
  
  // Remove existing scroll handler if any
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler, true);
    window.removeEventListener('wheel', scrollHandler, true);
    window.removeEventListener('touchmove', scrollHandler, true);
  }
  
  // Create reposition function
  const repositionElements = () => {
    if (!isActive || !currentStepElement) return;
    positionHighlight(currentStepElement);
    positionTooltip(currentStepData, currentStepElement);
  };
  
  // Create new scroll handler that repositions elements
  scrollHandler = (e) => {
    if (!isActive) return;
    
    // Don't prevent events on tooltip or its children (allow button interactions)
    const target = e.target;
    if (tooltip && (tooltip.contains(target) || target === tooltip || target.closest('.walkthrough-tooltip'))) {
      return; // Allow interactions with tooltip
    }
    
    // Don't prevent events on buttons or interactive elements
    if (target.tagName === 'BUTTON' || target.closest('button') || 
        target.tagName === 'A' || target.closest('a') ||
        target.tagName === 'INPUT' || target.closest('input')) {
      return; // Allow button clicks and form interactions
    }
    
    // Prevent default scroll behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Reposition highlight and tooltip to follow element
    repositionElements();
    
    return false;
  };
  
  // Add scroll prevention listeners
  window.addEventListener('scroll', scrollHandler, true);
  window.addEventListener('wheel', scrollHandler, { passive: false, capture: true });
  window.addEventListener('touchmove', scrollHandler, { passive: false, capture: true });
  
  // Also prevent keyboard scrolling
  const keyHandler = (e) => {
    if (!isActive) return;
    
    // Don't prevent events on tooltip or input elements (allow typing/interactions)
    const target = e.target;
    if (tooltip && (tooltip.contains(target) || target === tooltip || target.closest('.walkthrough-tooltip'))) {
      return; // Allow interactions with tooltip
    }
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return; // Allow typing in inputs
    }
    // Allow button interactions
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return; // Allow button clicks
    }
    
    // Prevent arrow keys, page up/down, home/end from scrolling
    if ([37, 38, 39, 40, 33, 34, 35, 36].includes(e.keyCode)) {
      e.preventDefault();
      e.stopPropagation();
      // Reposition elements if they try to scroll
      repositionElements();
      return false;
    }
  };
  
  window.addEventListener('keydown', keyHandler, true);
  
  // Store key handler for cleanup
  scrollHandler._keyHandler = keyHandler;
  scrollHandler._reposition = repositionElements;
  
  // Set up ResizeObserver to reposition elements if layout changes
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  
  resizeObserver = new ResizeObserver(() => {
    if (isActive && currentStepElement) {
      repositionElements();
    }
  });
  
  // Observe the element and document body for layout changes
  if (element) {
    resizeObserver.observe(element);
  }
  resizeObserver.observe(document.body);
  
  // Also observe window resize
  const resizeHandler = () => {
    if (isActive && currentStepElement) {
      repositionElements();
    }
  };
  
  window.addEventListener('resize', resizeHandler);
  scrollHandler._resizeHandler = resizeHandler;
}

function removeScrollPrevention() {
  // Always restore body overflow, regardless of originalBodyOverflow state
  // This ensures scrolling is restored even if something went wrong
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  originalBodyOverflow = null;
  
  // Disconnect resize observer
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  
  // Remove scroll handlers - try to remove even if scrollHandler is null
  // This handles edge cases where handlers might still be attached
  const handlersToRemove = [
    { event: 'scroll', handler: scrollHandler, capture: true },
    { event: 'wheel', handler: scrollHandler, capture: true },
    { event: 'touchmove', handler: scrollHandler, capture: true },
  ];
  
  handlersToRemove.forEach(({ event, handler, capture }) => {
    if (handler) {
      try {
        window.removeEventListener(event, handler, capture);
      } catch (e) {
        console.warn(`Error removing ${event} listener:`, e);
      }
    }
  });
  
  // Remove key handler if it exists
  if (scrollHandler && scrollHandler._keyHandler) {
    try {
      window.removeEventListener('keydown', scrollHandler._keyHandler, true);
    } catch (e) {
      console.warn('Error removing keydown listener:', e);
    }
  }
  
  // Remove resize handler if it exists
  if (scrollHandler && scrollHandler._resizeHandler) {
    try {
      window.removeEventListener('resize', scrollHandler._resizeHandler);
    } catch (e) {
      console.warn('Error removing resize listener:', e);
    }
  }
  
  scrollHandler = null;
  
  // Clear current step references
  currentStepElement = null;
  currentStepData = null;
  
  // Force a reflow to ensure styles are applied
  void document.body.offsetHeight;
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
  // Set inactive first to prevent any new scroll prevention
  isActive = false;
  
  // Always remove scroll prevention, even if already inactive
  // This ensures scrolling is restored even if something went wrong
  removeScrollPrevention();
  
  if (!isActive && overlay === null && highlight === null && tooltip === null) {
    // Already cleaned up, but ensure scrolling is restored
    removeScrollPrevention(); // Call again to be absolutely sure
    return;
  }
  
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

