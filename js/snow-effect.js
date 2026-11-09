// AcadVet USAM — Efecto decorativo de nieve cayendo (solo registro.html).
// Genera copos sueltos con CSS ya definidos en css/tema-navidad.css.
(function () {
  var container = document.createElement('div');
  container.className = 'navidad-snow';
  container.setAttribute('aria-hidden', 'true');

  var chars = ['❄', '❅', '❆'];
  var count = window.innerWidth < 480 ? 22 : 36;

  for (var i = 0; i < count; i++) {
    var flake = document.createElement('span');
    flake.className = 'navidad-flake';
    flake.textContent = chars[Math.floor(Math.random() * chars.length)];

    var duration = 8 + Math.random() * 10;
    var delay    = Math.random() * duration;
    var drift    = Math.round(Math.random() * 80 - 40) + 'px';

    flake.style.left = (Math.random() * 100) + 'vw';
    flake.style.fontSize = (8 + Math.random() * 12) + 'px';
    flake.style.opacity = (0.35 + Math.random() * 0.45).toFixed(2);
    flake.style.animationDuration = duration + 's';
    flake.style.animationDelay = '-' + delay + 's';
    flake.style.setProperty('--drift', drift);

    container.appendChild(flake);
  }

  document.body.appendChild(container);
})();
