(() => {
  const screen = document.getElementById("controls");
  if (!screen) return;
  const wrap = screen.querySelector(".ctlWrap");
  const note = screen.querySelector(".ctlRow");
  if (!wrap || !note) return;

  wrap.className = "ctlWrap ctlModeGrid";
  wrap.innerHTML = `
    <section class="ctlPanel" aria-label="Desktop controls">
      <div class="ctlPlatform">Desktop</div>
      <div class="ctlItems">
        <div class="ctlInput">W A S D</div><div class="ctlAction">Move</div>
        <div class="ctlInput">Mouse</div><div class="ctlAction">Look / Aim</div>
        <div class="ctlInput">Left Click</div><div class="ctlAction">Attack</div>
        <div class="ctlInput">Shift</div><div class="ctlAction">Sprint</div>
        <div class="ctlInput">1–5 / Wheel</div><div class="ctlAction">Select Weapon</div>
        <div class="ctlInput">R</div><div class="ctlAction">Cycle Weapon</div>
        <div class="ctlInput">Esc</div><div class="ctlAction">Pause</div>
      </div>
    </section>
    <section class="ctlPanel" aria-label="Mobile controls">
      <div class="ctlPlatform">Mobile</div>
      <div class="ctlItems">
        <div class="ctlInput">Left Stick</div><div class="ctlAction">Move</div>
        <div class="ctlInput">Right Drag</div><div class="ctlAction">Look / Aim</div>
        <div class="ctlInput">Attack</div><div class="ctlAction">Strike</div>
        <div class="ctlInput">Sprint</div><div class="ctlAction">Run</div>
        <div class="ctlInput">Weapon</div><div class="ctlAction">Switch Weapon</div>
        <div class="ctlInput">Ⅱ</div><div class="ctlAction">Pause</div>
        <div class="ctlInput">Landscape</div><div class="ctlAction">Recommended</div>
      </div>
    </section>`;

  note.className = "ctlHelpNote";
  note.innerHTML = `<strong>Automatic control detection</strong> · You can override Desktop / Touch in Settings.`;
})();
