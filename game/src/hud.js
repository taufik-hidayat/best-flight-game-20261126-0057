// The cockpit: a DOM heads-up display over the 3D view — altitude, speed and
// heading in big lit digits, a compass tape, throttle / fuel / damage bars,
// an artificial horizon, the mission line and toast messages. The instruments
// are drawn and lit, never static pictures.
import { headingDegrees, altitudeAboveGround } from './physics.js';
import { bearingToNextRing, distanceToNextRing, nextRing } from './missions.js';

const KNOTS = 1.94384;
const FEET = 3.28084;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

function compassLabel(deg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}

/** Build the HUD against the elements in index.html. */
export function createHud() {
  const el = (id) => document.getElementById(id);
  const alt = el('hud-alt');
  const spd = el('hud-spd');
  const hdg = el('hud-hdg');
  const vsi = el('hud-vsi');
  const tape = el('hud-tape');
  const thrFill = el('hud-thr-fill');
  const fuelFill = el('hud-fuel-fill');
  const dmgFill = el('hud-dmg-fill');
  const score = el('hud-score');
  const clock = el('hud-clock');
  const missionLine = el('hud-mission');
  const ringArrow = el('hud-ring-arrow');
  const toast = el('hud-toast');
  const warn = el('hud-warn');
  const attitude = el('hud-attitude');
  const actx = attitude.getContext('2d');
  const status = el('status');

  let lastToast = '';

  function announce(message) {
    status.textContent = message;
  }

  /** The artificial horizon: sky, ground, pitch ladder, fixed wings. */
  function drawAttitude(state) {
    const w = attitude.width;
    const h = attitude.height;
    const cx = w / 2;
    const cy = h / 2;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, 52, 0, Math.PI * 2);
    actx.clip();
    actx.translate(cx, cy);
    actx.rotate(-state.roll);
    const pitchPx = state.pitch * 90;
    actx.translate(0, pitchPx);
    // Sky above the horizon line, ground below it.
    actx.fillStyle = '#2f7fd0';
    actx.fillRect(-70, -90, 140, 90);
    actx.fillStyle = '#8a6a42';
    actx.fillRect(-70, 0, 140, 90);
    actx.strokeStyle = '#ffffff';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-70, 0);
    actx.lineTo(70, 0);
    actx.stroke();
    // Pitch ladder, every 10 degrees.
    actx.fillStyle = '#ffffff';
    actx.font = 'bold 9px system-ui, sans-serif';
    actx.textAlign = 'center';
    for (const deg of [-20, -10, 10, 20]) {
      const y = -deg * 1.5;
      actx.fillRect(-18, y, 36, 1);
      actx.fillText(String(Math.abs(deg)), 28, y + 3);
    }
    actx.restore();
    // Fixed aircraft symbol: the plane never moves, the world does.
    actx.strokeStyle = '#ffd23f';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 26, cy);
    actx.lineTo(cx - 8, cy);
    actx.moveTo(cx + 8, cy);
    actx.lineTo(cx + 26, cy);
    actx.moveTo(cx, cy);
    actx.lineTo(cx, cy + 6);
    actx.stroke();
    actx.strokeStyle = 'rgba(255,255,255,0.85)';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.arc(cx, cy, 52, 0, Math.PI * 2);
    actx.stroke();
  }

  /** A compass tape: the heading strip scrolls under a fixed lubber line. */
  function drawTape(heading) {
    let html = '';
    for (let d = -60; d <= 60; d += 15) {
      let deg = Math.round(heading + d);
      deg = ((deg % 360) + 360) % 360;
      const label = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][Math.floor(deg / 90) % 4] : String(deg).padStart(3, '0');
      const left = 50 + (d / 60) * 46;
      html += `<span class="tape-tick" style="left:${left}%">${label}</span>`;
    }
    tape.innerHTML = html;
  }

  /**
   * Refresh every instrument from the flight state and the mission.
   * `now` is the mission clock, used to fade toast messages.
   */
  function update(state, mission, best, now) {
    const speedKts = Math.round(state.speed * KNOTS);
    const altFt = Math.round(altitudeAboveGround(state) * FEET);
    const heading = headingDegrees(state);
    alt.textContent = `${altFt.toLocaleString('en-US')} FT`;
    spd.textContent = `${speedKts} KT`;
    hdg.textContent = `${String(Math.round(heading)).padStart(3, '0')}° ${compassLabel(heading)}`;
    const vsiFpm = Math.round(state.verticalSpeed * FEET * 60);
    vsi.textContent = `${vsiFpm >= 0 ? '+' : ''}${vsiFpm.toLocaleString('en-US')} FPM`;
    drawTape(heading);
    thrFill.style.width = `${Math.round(state.throttle * 100)}%`;
    fuelFill.style.width = `${Math.round(mission.fuel)}%`;
    fuelFill.className = mission.fuel < 25 ? 'fill fuel low' : 'fill fuel';
    dmgFill.style.width = `${Math.round(mission.damage)}%`;
    score.textContent = `${mission.score.toLocaleString('en-US')} PTS`;
    clock.textContent = formatClock(mission.timeLeft);
    clock.className = mission.timeLeft < 30 ? 'clock low' : 'clock';

    const ring = nextRing(mission);
    if (ring) {
      const dist = Math.round(distanceToNextRing(mission, state));
      const bearing = Math.round(bearingToNextRing(mission, state));
      let rel = bearing - heading;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const arrow = rel < -45 ? '◀◀' : rel < -12 ? '◀' : rel > 45 ? '▶▶' : rel > 12 ? '▶' : '▲';
      missionLine.textContent = `RING ${mission.ringIndex + 1}/${mission.rings.length} · ${ring.name} · ${dist} m`;
      ringArrow.textContent = arrow;
      ringArrow.className = Math.abs(rel) <= 12 ? 'ring-arrow on' : 'ring-arrow';
    } else if (mission.outcome === 'flying') {
      missionLine.textContent = 'ALL RINGS FLOWN — LAND ON THE RUNWAY';
      ringArrow.textContent = '▼';
      ringArrow.className = 'ring-arrow on';
    } else {
      missionLine.textContent = '';
      ringArrow.textContent = '';
    }

    if (mission.message && now < mission.messageUntil) {
      if (mission.message !== lastToast) {
        toast.textContent = mission.message;
        lastToast = mission.message;
      }
      toast.classList.add('show');
    } else {
      toast.classList.remove('show');
    }

    const warnings = [];
    if (state.speed < 27 && !state.grounded && state.mode === 'flying') warnings.push('STALL');
    if (mission.fuel < 20) warnings.push('LOW FUEL');
    if (mission.damage > 60) warnings.push('AIRFRAME DAMAGE');
    if (mission.timeLeft < 30) warnings.push('TIME LOW');
    warn.textContent = warnings.join(' · ');
    warn.classList.toggle('show', warnings.length > 0);

    drawAttitude(state);
    return best;
  }

  return { update, announce };
}
