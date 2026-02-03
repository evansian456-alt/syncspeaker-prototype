/**
 * Pro DJ Visual Stage Mode
 * Animated backgrounds, beat-reactive lights, crowd visuals, reaction effects
 * Only available to PRO tier subscribers
 */

const VISUAL_STAGE = {
  initialized: false,
  canvas: null,
  ctx: null,
  animationFrame: null,
  isActive: false,
  beatIntensity: 0,
  crowdEnergy: 0,
  particles: [],
  effects: []
};

/**
 * Initialize visual stage mode
 */
function initVisualStage() {
  if (VISUAL_STAGE.initialized) return;
  
  console.log('[VisualStage] Initializing Pro DJ Visual Stage Mode');
  
  // Create canvas overlay for visual effects
  const canvas = document.createElement('canvas');
  canvas.id = 'visualStageCanvas';
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 999;
    display: none;
  `;
  
  document.body.appendChild(canvas);
  
  VISUAL_STAGE.canvas = canvas;
  VISUAL_STAGE.ctx = canvas.getContext('2d');
  
  // Set canvas size
  resizeVisualStage();
  window.addEventListener('resize', resizeVisualStage);
  
  VISUAL_STAGE.initialized = true;
}

/**
 * Resize canvas to window size
 */
function resizeVisualStage() {
  if (!VISUAL_STAGE.canvas) return;
  
  VISUAL_STAGE.canvas.width = window.innerWidth;
  VISUAL_STAGE.canvas.height = window.innerHeight;
}

/**
 * Activate visual stage mode (Pro only)
 */
function activateVisualStage() {
  // Check if user has Pro tier
  const user = getCurrentUser ? getCurrentUser() : null;
  if (!user || user.tier !== 'PRO') {
    console.log('[VisualStage] Pro subscription required');
    return false;
  }
  
  if (!VISUAL_STAGE.initialized) {
    initVisualStage();
  }
  
  VISUAL_STAGE.isActive = true;
  VISUAL_STAGE.canvas.style.display = 'block';
  
  // Start animation loop
  startVisualStageAnimation();
  
  console.log('[VisualStage] Activated');
  return true;
}

/**
 * Deactivate visual stage mode
 */
function deactivateVisualStage() {
  VISUAL_STAGE.isActive = false;
  if (VISUAL_STAGE.canvas) {
    VISUAL_STAGE.canvas.style.display = 'none';
  }
  
  if (VISUAL_STAGE.animationFrame) {
    cancelAnimationFrame(VISUAL_STAGE.animationFrame);
    VISUAL_STAGE.animationFrame = null;
  }
  
  console.log('[VisualStage] Deactivated');
}

/**
 * Start animation loop
 */
function startVisualStageAnimation() {
  if (!VISUAL_STAGE.isActive) return;
  
  const ctx = VISUAL_STAGE.ctx;
  const canvas = VISUAL_STAGE.canvas;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw animated background
  drawStageBackground(ctx, canvas);
  
  // Draw beat-reactive lights
  drawBeatLights(ctx, canvas);
  
  // Draw crowd visuals
  drawCrowdVisuals(ctx, canvas);
  
  // Draw particles
  updateAndDrawParticles(ctx, canvas);
  
  // Draw effects
  updateAndDrawEffects(ctx, canvas);
  
  // Continue animation
  VISUAL_STAGE.animationFrame = requestAnimationFrame(startVisualStageAnimation);
}

/**
 * Draw animated stage background
 */
function drawStageBackground(ctx, canvas) {
  const time = Date.now() / 1000;
  
  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  
  // Animated colors
  const hue1 = (time * 20) % 360;
  const hue2 = (time * 20 + 120) % 360;
  
  gradient.addColorStop(0, `hsla(${hue1}, 70%, 30%, 0.3)`);
  gradient.addColorStop(0.5, `hsla(${hue2}, 70%, 25%, 0.2)`);
  gradient.addColorStop(1, `hsla(${hue1 + 60}, 70%, 30%, 0.3)`);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add pulsing overlay based on beat intensity
  if (VISUAL_STAGE.beatIntensity > 0) {
    const alpha = VISUAL_STAGE.beatIntensity * 0.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Decay beat intensity
    VISUAL_STAGE.beatIntensity *= 0.9;
  }
}

/**
 * Draw beat-reactive light effects
 */
function drawBeatLights(ctx, canvas) {
  const time = Date.now() / 1000;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Draw rotating beams
  ctx.save();
  ctx.translate(centerX, centerY);
  
  const beamCount = 8;
  const rotation = time * 0.5;
  
  for (let i = 0; i < beamCount; i++) {
    const angle = (i / beamCount) * Math.PI * 2 + rotation;
    const intensity = 0.3 + VISUAL_STAGE.beatIntensity * 0.5;
    
    ctx.save();
    ctx.rotate(angle);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, `rgba(90, 169, 255, ${intensity})`);
    gradient.addColorStop(1, 'rgba(90, 169, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(-20, 0, 40, canvas.height);
    
    ctx.restore();
  }
  
  ctx.restore();
}

/**
 * Draw crowd visuals
 */
function drawCrowdVisuals(ctx, canvas) {
  const time = Date.now() / 1000;
  const crowdSize = 50;
  const crowdY = canvas.height * 0.7;
  
  // Draw simplified crowd silhouettes
  for (let i = 0; i < crowdSize; i++) {
    const x = (i / crowdSize) * canvas.width;
    const bounceAmount = Math.sin(time * 3 + i * 0.5) * 10 * (VISUAL_STAGE.crowdEnergy / 100);
    const y = crowdY + bounceAmount;
    
    // Draw person silhouette
    ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Add hands up effect when energy is high
    if (VISUAL_STAGE.crowdEnergy > 70) {
      const handY = y - 15 + Math.sin(time * 5 + i) * 5;
      ctx.fillStyle = `rgba(255, 255, 255, 0.4)`;
      ctx.fillRect(x - 5, handY, 2, 8);
      ctx.fillRect(x + 3, handY, 2, 8);
    }
  }
}

/**
 * Update and draw particles
 */
function updateAndDrawParticles(ctx, canvas) {
  // Update existing particles
  VISUAL_STAGE.particles = VISUAL_STAGE.particles.filter(particle => {
    particle.life -= 0.016; // Assume 60fps
    particle.y += particle.vy;
    particle.x += particle.vx;
    particle.vy += particle.gravity;
    
    if (particle.life <= 0) return false;
    
    // Draw particle
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    
    return true;
  });
}

/**
 * Update and draw effects
 */
function updateAndDrawEffects(ctx, canvas) {
  VISUAL_STAGE.effects = VISUAL_STAGE.effects.filter(effect => {
    effect.life -= 0.016;
    
    if (effect.life <= 0) return false;
    
    // Draw based on effect type
    if (effect.type === 'burst') {
      drawBurstEffect(ctx, effect);
    } else if (effect.type === 'wave') {
      drawWaveEffect(ctx, canvas, effect);
    } else if (effect.type === 'flash') {
      drawFlashEffect(ctx, canvas, effect);
    }
    
    return true;
  });
}

/**
 * Draw burst effect
 */
function drawBurstEffect(ctx, effect) {
  const alpha = effect.life / effect.maxLife;
  const size = (1 - effect.life / effect.maxLife) * 200;
  
  ctx.strokeStyle = `rgba(${effect.r}, ${effect.g}, ${effect.b}, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, size, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw wave effect
 */
function drawWaveEffect(ctx, canvas, effect) {
  const alpha = effect.life / effect.maxLife;
  const progress = 1 - (effect.life / effect.maxLife);
  const y = canvas.height * 0.5 + Math.sin(progress * Math.PI * 2) * 100;
  
  ctx.strokeStyle = `rgba(${effect.r}, ${effect.g}, ${effect.b}, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
}

/**
 * Draw flash effect
 */
function drawFlashEffect(ctx, canvas, effect) {
  const alpha = effect.life / effect.maxLife * 0.5;
  ctx.fillStyle = `rgba(${effect.r}, ${effect.g}, ${effect.b}, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Trigger beat pulse
 */
function triggerBeatPulse(intensity = 1.0) {
  if (!VISUAL_STAGE.isActive) return;
  
  VISUAL_STAGE.beatIntensity = Math.min(1.0, intensity);
  
  // Add particles on beat
  addBeatParticles();
}

/**
 * Add particles on beat
 */
function addBeatParticles() {
  const canvas = VISUAL_STAGE.canvas;
  if (!canvas) return;
  
  const count = 10;
  for (let i = 0; i < count; i++) {
    VISUAL_STAGE.particles.push({
      x: Math.random() * canvas.width,
      y: canvas.height,
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 8 - 4,
      gravity: 0.3,
      size: Math.random() * 3 + 2,
      r: 90 + Math.random() * 165,
      g: 169 + Math.random() * 86,
      b: 255,
      life: 1.0,
      maxLife: 1.0
    });
  }
}

/**
 * Update crowd energy
 */
function updateCrowdEnergy(energy) {
  VISUAL_STAGE.crowdEnergy = Math.max(0, Math.min(100, energy));
}

/**
 * Trigger reaction effect
 */
function triggerReactionEffect(reactionType, x, y) {
  if (!VISUAL_STAGE.isActive) return;
  
  const canvas = VISUAL_STAGE.canvas;
  if (!canvas) return;
  
  // Default position if not provided
  if (x === undefined) x = canvas.width / 2;
  if (y === undefined) y = canvas.height / 2;
  
  // Add effect based on reaction type
  if (reactionType === 'fire' || reactionType === 'DROP') {
    VISUAL_STAGE.effects.push({
      type: 'burst',
      x, y,
      r: 255, g: 100, b: 0,
      life: 1.0,
      maxLife: 1.0
    });
  } else if (reactionType === 'heart') {
    VISUAL_STAGE.effects.push({
      type: 'burst',
      x, y,
      r: 255, g: 100, b: 150,
      life: 1.0,
      maxLife: 1.0
    });
  } else if (reactionType === 'flash') {
    VISUAL_STAGE.effects.push({
      type: 'flash',
      r: 255, g: 255, b: 255,
      life: 0.3,
      maxLife: 0.3
    });
  } else {
    // Default wave effect
    VISUAL_STAGE.effects.push({
      type: 'wave',
      r: 90, g: 169, b: 255,
      life: 1.0,
      maxLife: 1.0
    });
  }
  
  // Add particle burst
  const particleCount = 20;
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const speed = Math.random() * 5 + 3;
    
    VISUAL_STAGE.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.2,
      size: Math.random() * 4 + 2,
      r: 90 + Math.random() * 165,
      g: 169 + Math.random() * 86,
      b: 255,
      life: 1.5,
      maxLife: 1.5
    });
  }
}

// Export functions if in module environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initVisualStage,
    activateVisualStage,
    deactivateVisualStage,
    triggerBeatPulse,
    updateCrowdEnergy,
    triggerReactionEffect
  };
}
