import * as THREE from './vendor/three/three.module.js';

const $ = (selector) => document.querySelector(selector);
const worldEl = $('#world');
const backgroundMusic = $('#background-music');
backgroundMusic.volume = .2;
const hud = {
  hp: $('#hp-text'), health: $('#health-fill'), armor: $('#armor-fill'), ammo: $('#ammo-text'), reserve: $('#reserve-text'),
  weapon: $('#weapon-name'), inventory: $('#inventory-icons'), objective: $('#objective-text'), objectiveFill: $('#objective-fill'),
  objectiveSub: $('#objective-sub'), prompt: $('#interaction-prompt'), promptText: $('#interaction-text'),
  mission: $('#mission-state'), toast: $('#toast'), quiz: $('#quiz-panel'), quizTimer: $('#quiz-timer'),
  quizQuestion: $('#quiz-question'), quizOptions: $('#quiz-options'), intro: $('#intro-overlay'),
  outcome: $('#outcome-overlay'), outcomeCard: $('#outcome-card'), damage: $('#damage-flash')
};
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 800;
const roles = {
  soldier: { maxHp: 100, speed: 8.1, label: 'CHIẾN SĨ' },
  porter: { maxHp: 120, speed: 7.1, label: 'DÂN CÔNG' },
  scout: { maxHp: 90, speed: 10.2, label: 'TRINH SÁT' }
};
const questionBank = [
  { q: 'Kế hoạch Nava muốn biến Điện Biên Phủ thành điều gì?', options: ['Một tập đoàn cứ điểm để quyết chiến', 'Một thương cảng quốc tế', 'Thủ đô mới', 'Một căn cứ hải quân'], answer: 0, source: 'Buổi 13, slide 14' },
  { q: 'Mục tiêu của tiến công Đông Xuân 1953–1954 là gì?', options: ['Rút khỏi Tây Bắc', 'Giữ thế chủ động, buộc địch phân tán lực lượng', 'Chỉ phòng thủ Hà Nội', 'Ngừng hoạt động quân sự'], answer: 1, source: 'Buổi 13, slide 15' },
  { q: 'Ai là Tư lệnh Chiến dịch Điện Biên Phủ?', options: ['Lê Duẩn', 'Đỗ Mười', 'Đại tướng Võ Nguyên Giáp', 'Nguyễn Văn Linh'], answer: 2, source: 'Buổi 13, slide 15' },
  { q: 'Chiến thắng Điện Biên Phủ được gắn với kết quả ngoại giao nào?', options: ['Hiệp định Paris 1973', 'Hiệp định Genève 1954', 'Cương lĩnh 1991', 'Hiệp định Sơ bộ 1946'], answer: 1, source: 'Buổi 13, slide 16–17' },
  { q: 'Chiến dịch Điện Biên Phủ toàn thắng vào ngày nào?', options: ['30/4/1975', '21/7/1954', '7/5/1954', '2/9/1945'], answer: 2, source: 'Buổi 13–14; mốc chiến dịch 7/5/1954' }
];
const cratePositions = [[-2, 25], [4, 9], [-4, -6], [3, -21], [-2, -36]];
const enemyPositions = [[9, 23], [-9, 19], [12, 11], [-12, 4], [8, -3], [-9, -9], [13, -16], [-12, -23], [9, -30], [-8, -38], [13, -41], [-14, -32]];
const keys = new Set();
const tmp = new THREE.Vector3();
const clock = new THREE.Clock();
let renderer, scene, camera, player, playerParts, bunker, flagGroup, flagMesh;
let role = null, status = 'intro', hp = 100, maxHp = 100, armor = 0, speed = 8, ammo = 5, reserve = 0;
let rifle = false, grenades = 0, opened = 0, kills = 0, yaw = 0, pitch = .12, lastShot = 0, reloadUntil = 0;
let nearest = null, activeQuestion = -1, quizDeadline = 0, soundEnabled = false, audioContext = null, ambientGain = null, toastTimer = 0;
let nextBattleSoundAt = Infinity, shotFlashTimer = 0;
let enemies = [], crates = [], enemyBullets = [], effects = [], obstacles = [], shrubs = [];
let lastTime = 0, hudTime = 0, miniTime = 0, motion = 0, touchMove = { x: 0, y: 0 }, touchLookId = null;
let activeBombs = [], nextBombAt = Infinity, lastBlastDamageAt = -Infinity;
const knockback = new THREE.Vector3();
let lift = 0, liftSpeed = 0, staggerUntil = 0;

function material(color, roughness = .94) { return new THREE.MeshStandardMaterial({ color, roughness }); }
const mats = {
  earth: material(0x66583e), road: material(0x82704b), trench: material(0x3a3628), bag: material(0x8b7957),
  wood: material(0x4d3424), dark: material(0x1b251b), leaf: material(0x425334), olive: material(0x596a3e),
  enemy: material(0x765b42), skin: material(0xbb8e6a), steel: material(0x3d4140), gold: material(0xeac674),
  loot: new THREE.MeshStandardMaterial({ color: 0x63d3d2, emissive: 0x256c70, emissiveIntensity: .6, metalness: .25 }),
  muzzle: new THREE.MeshBasicMaterial({ color: 0xffd17e }), bullet: new THREE.MeshBasicMaterial({ color: 0xff8a4e }),
  stone: material(0x686052)
};
function mesh(geometry, mat, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); parent.add(m); return m;
}
function box(w, h, d, mat, x, y, z, parent = scene) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent); }
function seeded(seed) { let value = seed; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
const rand = seeded(1954);
function tone() { const c = new THREE.Color(); c.setHSL(.105 + rand() * .035, .19 + rand() * .08, .27 + rand() * .07); return c; }

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1 : 1.25));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    worldEl.appendChild(renderer.domElement);
  } catch (error) { $('#webgl-error').hidden = false; console.error(error); return false; }
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x8f8c72); scene.fog = new THREE.FogExp2(0x938e70, .013);
  camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 160);
  scene.add(new THREE.HemisphereLight(0xffe2a4, 0x353d2c, 2.1));
  const sun = new THREE.DirectionalLight(0xffc784, 2.2); sun.position.set(-38, 45, -65); scene.add(sun);
  makeWorld();
  renderer.setAnimationLoop(tick);
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastTime = 0;if(document.hidden)audioContext?.suspend();else if(soundEnabled)audioContext?.resume(); });
  return true;
}
function resize() { if (!renderer) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 800 ? 1 : 1.25)); renderer.setSize(innerWidth, innerHeight); }
function terrainHeight(x, z) { const lane = Math.min(1, Math.max(0, (Math.abs(x) - 8) / 17)); return lane * (.55 * Math.sin(x * .18 + z * .09) + .38 * Math.sin(z * .23)) + .07 * Math.sin(z * .34); }
function makeGround() {
  const geom = new THREE.PlaneGeometry(112, 124, 46, 50); geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position, colors = [];
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, terrainHeight(x, z)); const color = tone(); if (Math.abs(x) < 7) color.lerp(new THREE.Color(0x8e7b58), .37); colors.push(color.r, color.g, color.b); }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geom.computeVertexNormals();
  mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true }), 0, 0, 0);
  for (let i = 0; i < 13; i++) { const z = 35 - i * 7; box(10, .07, 3.5, mats.road, rand() * 1.5 - .75, .035, z); }
}
function makeTrenches() {
  const bagGeom = new THREE.SphereGeometry(1, 8, 5);
  const count = 180, inst = new THREE.InstancedMesh(bagGeom, mats.bag, count), dummy = new THREE.Object3D();
  let n = 0;
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 45; i++) {
    const z = 40 - i * 2.05, x = side * (9.8 + Math.sin(z * .13) * 1.5) + (rand() - .5) * .2;
    dummy.position.set(x, .35 + row * .62, z); dummy.scale.set(1.25, .38, .75); dummy.rotation.y = .08 * Math.sin(i); dummy.updateMatrix(); inst.setMatrixAt(n++, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true; scene.add(inst);
  for (let i = 0; i < 14; i++) {
    const z = 34 - i * 6.5, x = (i % 2 ? -1 : 1) * (11.4 + rand() * 3);
    const stake = mesh(new THREE.CylinderGeometry(.09, .12, 1.9, 5), mats.wood, x, .9, z); stake.rotation.z = i % 2 ? -.14 : .14;
    if (i % 3 === 0) { const cover = box(2.8, 1.3, 2.3, mats.wood, x + (i % 2 ? -1.2 : 1.2), .7, z - 1.2); obstacles.push(cover); }
  }
}
function makeLandscape() {
  const mountainColors = [0x56614b, 0x687260, 0x747764];
  for (let i = 0; i < 26; i++) {
    const angle = i / 26 * Math.PI * 2, radius = 74 + rand() * 20, height = 12 + rand() * 25;
    const g = new THREE.ConeGeometry(8 + rand() * 11, height, 5);
    const m = mesh(g, material(mountainColors[i % 3], 1), Math.sin(angle) * radius, height * .46 - 2, Math.cos(angle) * radius); m.rotation.y = rand() * Math.PI;
  }
  const trunkGeom = new THREE.CylinderGeometry(.18, .3, 2.5, 5), crownGeom = new THREE.ConeGeometry(1.35, 3.8, 6);
  const trunk = new THREE.InstancedMesh(trunkGeom, mats.wood, 42), crown = new THREE.InstancedMesh(crownGeom, mats.leaf, 42), dummy = new THREE.Object3D();
  for (let i = 0; i < 42; i++) {
    const x = (rand() < .5 ? -1 : 1) * (14 + rand() * 36), z = rand() * 105 - 53, s = .7 + rand() * .65;
    dummy.position.set(x, 1.25 * s + terrainHeight(x,z), z); dummy.scale.set(s,s,s); dummy.rotation.set(0,0,0); dummy.updateMatrix(); trunk.setMatrixAt(i,dummy.matrix);
    dummy.position.y = 3.25 * s + terrainHeight(x,z); dummy.updateMatrix(); crown.setMatrixAt(i,dummy.matrix);
  }
  trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = true; scene.add(trunk,crown);
  const rockGeom = new THREE.DodecahedronGeometry(1,0), rocks = new THREE.InstancedMesh(rockGeom,mats.stone,54);
  for(let i=0;i<54;i++){const x=(rand()<.5?-1:1)*(10+rand()*29),z=rand()*108-54,s=.35+rand()*1.1;dummy.position.set(x,.2+terrainHeight(x,z),z);dummy.scale.set(s,s*.55,s*.8);dummy.rotation.y=rand()*6;dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix)}
  rocks.instanceMatrix.needsUpdate=true;scene.add(rocks);
  const sun = mesh(new THREE.SphereGeometry(5,16,12),new THREE.MeshBasicMaterial({color:0xffcf7b}),-42,33,-92); sun.layers.enable(0);
}
function makeBunker() {
  bunker = new THREE.Group(); bunker.position.set(0,0,-49); scene.add(bunker);
  box(16,5,8,mats.stone,0,2.6,0,bunker);
  box(18,1.2,9.4,mats.earth,0,5.6,0,bunker);
  box(4.2,3.7,.3,mats.dark,0,2.05,4.18,bunker);
  for(const x of [-6,-4,4,6])box(1.5,.7,.35,mats.dark,x,3.7,4.22,bunker);
  for(let i=0;i<19;i++){const b=mesh(new THREE.SphereGeometry(.72,8,5),mats.bag,-8.7+i*.95,5.94,4.7,bunker);b.scale.set(1,.52,.7)}
  box(9,.2,11,mats.wood,0,.17,7,bunker);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#2b3627';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#ddc787';ctx.lineWidth=5;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#f3e5bb';ctx.font='bold 47px sans-serif';ctx.textAlign='center';ctx.fillText('HẦM CHỈ HUY',256,82);
  const sign=mesh(new THREE.PlaneGeometry(5.8,1.45),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(signCanvas),transparent:true,side:THREE.DoubleSide}),0,5.1,4.72,bunker);
  sign.rotation.y=0;
  flagGroup=new THREE.Group(); flagGroup.position.set(3,6.2,1); bunker.add(flagGroup); flagGroup.visible=false;
  mesh(new THREE.CylinderGeometry(.07,.09,8,8),mats.steel,0,4,0,flagGroup);
  const flagCanvas=document.createElement('canvas');flagCanvas.width=512;flagCanvas.height=320;const c=flagCanvas.getContext('2d');c.fillStyle='#c91f20';c.fillRect(0,0,512,320);c.fillStyle='#f9d956';c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?55:127;c.lineTo(255+Math.cos(a)*r,160+Math.sin(a)*r)}c.closePath();c.fill();
  const flagGeom=new THREE.PlaneGeometry(4,2.5,15,8);flagGeom.translate(2,0,0);
  flagMesh=mesh(flagGeom,new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(flagCanvas),side:THREE.DoubleSide}),0,6.4,0,flagGroup);
}
function soldierModel(isEnemy=false) {
  const group=new THREE.Group(), uniform=isEnemy?mats.enemy:mats.olive;
  const torso=box(.75,1.15,.43,uniform,0,1.62,0,group);
  mesh(new THREE.SphereGeometry(.33,10,7),mats.skin,0,2.48,0,group);
  const helmet=mesh(new THREE.SphereGeometry(.46,10,6),isEnemy?mats.earth:mats.dark,0,2.7,0,group);helmet.scale.y=.52;
  const brim=mesh(new THREE.CylinderGeometry(.5,.5,.08,10),isEnemy?mats.earth:mats.dark,0,2.59,0,group);
  const legs=[];
  for(const x of [-.22,.22]){const leg=mesh(new THREE.CylinderGeometry(.17,.2,.8,6),uniform,x,.58,0,group);legs.push(leg);box(.34,.17,.48,mats.dark,x,.16,.07,group)}
  for(const x of [-.5,.5]){const arm=mesh(new THREE.CylinderGeometry(.13,.14,.88,6),uniform,x,1.68,.04,group);arm.rotation.z=x<0?-.3:.4}
  box(.15,.17,1.1,mats.steel,.2,1.61,-.52,group);
  box(.21,.25,.28,mats.wood,.2,1.53,.07,group);
  if(!isEnemy)box(.6,.62,.26,mats.bag,0,1.58,.35,group);
  group.userData.legs=legs;return group;
}
function makeCrates() {
  cratePositions.forEach(([x,z],index)=>{
    const group=new THREE.Group();group.position.set(x,0,z);scene.add(group);
    box(1.35,.95,1.2,mats.wood,0,.65,0,group);box(1.42,.14,1.27,mats.loot,0,1.18,0,group);
    for(const side of [-1,1]){box(.13,1,.13,mats.steel,side*.55,.65,.49,group);box(.13,1,.13,mats.steel,side*.55,.65,-.49,group)}
    const beam=mesh(new THREE.CylinderGeometry(.22,.95,8,12,1,true),new THREE.MeshBasicMaterial({color:0x64d9d9,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}),0,5,0,group);
    const ring=mesh(new THREE.TorusGeometry(1,.045,5,18),mats.loot,0,1.45,0,group);ring.rotation.x=Math.PI/2;
    const marker=mesh(new THREE.OctahedronGeometry(.38),mats.loot,0,2.1,0,group);
    crates.push({index,group,ring,marker,beam,opened:false});
  });
}
function makeEnemies() {
  enemyPositions.forEach(([x,z],index)=>{const body=soldierModel(true);body.position.set(x,0,z);body.rotation.y=Math.PI;scene.add(body);enemies.push({index,body,anchor:new THREE.Vector3(x,0,z),phase:rand()*Math.PI*2,hp:1,alive:true,cooldown:1+rand()*2,walk:rand()*6})});
}
function makeWorld() {
  makeGround();makeTrenches();makeLandscape();makeBunker();makeCrates();makeEnemies();
  player=soldierModel(false);player.position.set(0,0,37);scene.add(player);player.visible=false;
  updateCamera(.016,true);
}

function setRole(id) {
  role=id;document.querySelectorAll('.role-card').forEach(b=>b.classList.toggle('selected',b.dataset.role===id));$('#start-btn').disabled=false;
}
function startGame() {
  if(!role)return;
  const info=roles[role];maxHp=info.maxHp;hp=maxHp;speed=info.speed;status='running';player.visible=true;hud.intro.hidden=true;nextBombAt=performance.now()+5000;
  updateObjective();updateHud();showToast('WASD để di chuyển • bấm vào chiến trường để ngắm và bắn');
  setBattleSound(true);
}
function updateObjective() {
  hud.objectiveFill.style.width=`${kills/enemies.length*100}%`;
  hud.objectiveSub.textContent=`HẠ ${kills} / ${enemies.length} ĐỊCH • ${opened} / 5 HÒM ĐÃ MỞ`;
  if(status==='intro')hud.objective.textContent='Chọn vai để bắt đầu chiến dịch';
  else if(status==='victory')hud.objective.textContent='Chiến dịch toàn thắng!';
  else if(status==='dead')hud.objective.textContent='Nhiệm vụ đã dừng lại';
  else hud.objective.textContent='Hạ toàn bộ đối phương • hòm tiếp tế tùy chọn';
}
function updateHud() {
  hud.hp.textContent=`${Math.ceil(Math.max(0,hp))} / ${maxHp}`;hud.health.style.width=`${Math.max(0,hp/maxHp*100)}%`;
  hud.armor.style.width=`${armor}%`;hud.ammo.textContent=ammo;hud.reserve.textContent=reserve;
  hud.weapon.textContent=rifle?'SÚNG TRƯỜNG TĂNG CƯỜNG':'SÚNG TRƯỜNG';
  const icons=[];if(rifle)icons.push('<i title="Súng tăng cường">⌁</i>');if(armor)icons.push('<i title="Áo giáp">◆</i>');if(grenades)icons.push(`<i title="Lựu đạn">✦${grenades}</i>`);hud.inventory.innerHTML=icons.join('')||'<i title="Chưa có tiếp tế">—</i>';
  hud.mission.textContent=status==='quiz'?'ĐANG GIẢI MÃ TIẾP TẾ':status==='victory'?'CHIẾN DỊCH TOÀN THẮNG':status==='dead'?'NHIỆM VỤ KẾT THÚC':`HẠ ${kills}/${enemies.length} ĐỊCH • ĐẠN ${ammo+reserve}`;
}
function showToast(text) { hud.toast.textContent=text;hud.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>hud.toast.classList.remove('show'),2800); }
function audio(freq=320,duration=.12,type='sine',volume=.06){if(!soundEnabled)return;try{audioContext ||= new(window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration)}catch{}}
function setBattleSound(enabled){
  const button=$('#sound-btn');soundEnabled=enabled;
  button.setAttribute('aria-pressed',String(enabled));
  button.innerHTML=enabled?'◖)) <span>TẮT ÂM THANH</span>':'◖)) <span>BẬT ÂM THANH</span>';
  if(!enabled){backgroundMusic.pause();if(ambientGain&&audioContext)ambientGain.gain.setTargetAtTime(0,audioContext.currentTime,.12);return}
  try{
    backgroundMusic.play().catch(error=>{if(error.name!=='NotAllowedError')showToast('Không thể tải nhạc nền từ website tham chiếu.')});
    audioContext ||= new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();
    if(!ambientGain){
      const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate),data=buffer.getChannelData(0);
      let low=0;for(let i=0;i<data.length;i++){low=(low+(Math.random()*2-1)*.05)*.985;data[i]=low}
      const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter();ambientGain=audioContext.createGain();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=420;ambientGain.gain.value=0;
      source.connect(filter).connect(ambientGain).connect(audioContext.destination);source.start();
    }
    ambientGain.gain.setTargetAtTime((status==='running'||status==='quiz')?.28:0,audioContext.currentTime,.25);
    nextBattleSoundAt=performance.now()+2500;
  }catch{soundEnabled=false;button.setAttribute('aria-pressed','false');button.innerHTML='◖)) <span>ÂM THANH KHÔNG KHẢ DỤNG</span>'}
}
function noiseBlast(duration,volume,cutoff){
  if(!soundEnabled||!audioContext)return;
  const n=Math.ceil(audioContext.sampleRate*duration),buffer=audioContext.createBuffer(1,n,audioContext.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain(),now=audioContext.currentTime;
  source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;
  gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.007);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  source.connect(filter).connect(gain).connect(audioContext.destination);source.start(now);source.stop(now+duration);
}
function battleSound(kind){
  if(!soundEnabled||!audioContext)return;
  if(kind==='shot'){noiseBlast(.18,.2,2200);audio(90,.2,'sawtooth',.12)}
  else if(kind==='enemy'){noiseBlast(.13,.055,1300);audio(115,.12,'sawtooth',.035)}
  else if(kind==='bomb'){noiseBlast(.8,.25,450);audio(65,.7,'sawtooth',.14)}
  else{noiseBlast(.55,.045,300);audio(78,.42,'sawtooth',.025)}
}

function interact() {
  if(status!=='running')return;
  if(!nearest||nearest.opened)return;
  activeQuestion=nearest.index;status='quiz';quizDeadline=performance.now()+26000;
  if(document.pointerLockElement)document.exitPointerLock();
  const q=questionBank[activeQuestion];hud.quizQuestion.textContent=q.q;
  hud.quizOptions.innerHTML=q.options.map((text,i)=>`<button type="button" data-answer="${i}"><b>${'ABCD'[i]}.</b> ${text}</button>`).join('');
  hud.quiz.hidden=false;hud.prompt.hidden=true;updateHud();showToast('Nhanh lên! Đối phương vẫn bắn trong lúc bạn trả lời.');audio(580,.15,'triangle');
}
function answer(index) {
  if(status!=='quiz')return;
  const q=questionBank[activeQuestion];hud.quiz.hidden=true;
  if(index!==q.answer){die('Trả lời chưa đúng. '+q.source);return}
  const crate=crates[activeQuestion];crate.opened=true;scene.remove(crate.group);opened++;
  const loaded=Math.min(3,12-ammo);ammo+=loaded;reserve=Math.min(36,reserve+3-loaded);
  status='running';activeQuestion=-1;nearest=null;updateObjective();updateHud();
  showToast(`CHÍNH XÁC! +3 ĐẠN • ${q.source}`);audio(760,.22,'triangle');
}
function takeDamage(value,reason='Trúng hỏa lực đối phương. Hãy tìm chỗ tránh và xử lý tiếp tế nhanh hơn.'){if(status!=='running'&&status!=='quiz')return;const blocked=Math.min(armor,value*.7);armor=Math.max(0,armor-blocked);hp-=value-blocked;hud.damage.classList.add('active');setTimeout(()=>hud.damage.classList.remove('active'),190);audio(145,.15,'sawtooth',.07);updateHud();if(hp<=0)die(reason);}
function die(reason){if(status==='dead'||status==='victory')return;status='dead';hud.quiz.hidden=true;hud.prompt.hidden=true;clearBomb();if(ambientGain)ambientGain.gain.setTargetAtTime(0,audioContext.currentTime,.35);if(document.pointerLockElement)document.exitPointerLock();
  hud.outcome.hidden=false;hud.outcomeCard.innerHTML=`<span class="outcome-kicker">HÀNH TRÌNH DỪNG LẠI / ĐÃ HẠ ${kills} ĐỐI PHƯƠNG</span><h2>BẠN ĐÃ HY SINH<br><em>THẬT ANH DŨNG</em></h2><p>${reason}</p><p>Hòm tiếp tế kiến thức giúp bạn có thêm đạn cho lần xuất phát tiếp theo.</p><div class="outcome-actions"><button type="button" class="primary" id="retry-btn">THỬ LẠI ↻</button><a href="learn.html">VỀ GIÁO TRÌNH</a></div><small>Trò chơi mô phỏng, không tái hiện chính xác diễn biến chiến đấu.</small>`;
  $('#retry-btn').onclick=()=>location.reload();updateObjective();updateHud();audio(95,.5,'sawtooth',.1);
}
function victory(){if(status!=='running')return;status='victory';flagGroup.visible=true;hud.prompt.hidden=true;clearBomb();if(ambientGain)ambientGain.gain.setTargetAtTime(0,audioContext.currentTime,.35);if(document.pointerLockElement)document.exitPointerLock();
  hud.outcome.hidden=false;hud.outcomeCard.innerHTML=`<span class="outcome-kicker">07 / 05 / 1954 — ĐIỆN BIÊN PHỦ</span><h2>CHÚC MỪNG<br><em>CHIẾN THẮNG!</em></h2><p>Bạn đã hạ toàn bộ ${enemies.length} đối phương. Lá cờ đỏ sao vàng tung bay trên hầm chỉ huy! Hòm tiếp tế là lựa chọn để bổ sung đạn.</p><div class="outcome-actions"><button type="button" class="primary" id="retry-btn">CHƠI LẠI ↻</button><a href="learn.html">ÔN TẬP VNR202</a></div><small>Kiến thức: giáo trình VNR202, buổi 13–14 • Thế giới 3D là minh họa.</small>`;
  $('#retry-btn').onclick=()=>location.reload();updateObjective();updateHud();try{localStorage.setItem('vnr202-3d-victory','1')}catch{}
  for(let i=0;i<4;i++)setTimeout(()=>burst(new THREE.Vector3((rand()-.5)*18,10+rand()*9,-44)),i*400);
  [480,580,720,960].forEach((f,i)=>setTimeout(()=>audio(f,.24,'triangle'),i*140));
}

function reload(){if(status!=='running'||reloadUntil>performance.now()||ammo>=(rifle?24:12)||reserve===0)return;reloadUntil=performance.now()+1250;showToast('ĐANG NẠP ĐẠN...');setTimeout(()=>{if(status==='dead')return;const capacity=rifle?24:12,amount=Math.min(capacity-ammo,reserve);ammo+=amount;reserve-=amount;updateHud();audio(420,.08,'square')},1250)}
function killEnemy(enemy){if(!enemy.alive)return;enemy.alive=false;scene.remove(enemy.body);kills++;updateObjective();updateHud();if(kills===enemies.length)victory();else showToast(`ĐÃ HẠ ĐỐI PHƯƠNG • CÒN ${enemies.length-kills}`)}
function fire(){if(status!=='running'||performance.now()-lastShot<(rifle?230:430)||reloadUntil>performance.now())return;if(ammo<=0){showToast('HẾT ĐẠN — BẤM R ĐỂ NẠP');audio(170,.06,'square');return}lastShot=performance.now();ammo--;updateHud();battleSound('shot');
  const start=new THREE.Vector3(.2,1.63,-1.08).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(player.position);
  const flash=mesh(new THREE.SphereGeometry(.3,8,6),new THREE.MeshBasicMaterial({color:0xffda73,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}),start.x,start.y,start.z);
  flash.scale.set(1.5,.85,1.5);effects.push({mesh:flash,ttl:.09});burst(start,4,0xffce64);
  const screenFlash=$('#shot-flash');screenFlash.classList.add('active');clearTimeout(shotFlashTimer);shotFlashTimer=setTimeout(()=>screenFlash.classList.remove('active'),75);
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);
  let hit=null,best=Infinity;
  for(const e of enemies){if(!e.alive)continue;const target=e.body.position.clone().add(new THREE.Vector3(0,1.5,0));const to=target.clone().sub(ray.ray.origin),along=to.dot(ray.ray.direction),near=ray.ray.origin.clone().addScaledVector(ray.ray.direction,along).distanceTo(target);if(along>0&&along<56&&near<1.15&&along<best){best=along;hit=e}}
  const end=hit?hit.body.position.clone().add(new THREE.Vector3(0,1.5,0)):ray.ray.origin.clone().addScaledVector(ray.ray.direction,45);
  tracer(start,end,0xffd581,.16);
  if(hit){hit.hp-=rifle?2:1;burst(end,5,0xffb767);if(hit.hp<=0)killEnemy(hit)}
}
function tracer(a,b,color,ttl){const direction=b.clone().sub(a),length=direction.length(),line=mesh(new THREE.CylinderGeometry(.025,.025,length,5),new THREE.MeshBasicMaterial({color}),0,0,0);line.position.copy(a).add(b).multiplyScalar(.5);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());effects.push({mesh:line,ttl})}
function burst(point,count=14,color=0xffca7d){for(let i=0;i<count;i++){const p=mesh(new THREE.SphereGeometry(.06+rand()*.08,5,4),new THREE.MeshBasicMaterial({color}),point.x,point.y,point.z);effects.push({mesh:p,ttl:.5+rand()*.4,velocity:new THREE.Vector3((rand()-.5)*8,rand()*7,(rand()-.5)*8)})}}

function removeBomb(bomb){scene.remove(bomb.marker);bomb.marker.traverse(part=>{part.geometry?.dispose();part.material?.dispose()})}
function clearBomb(){activeBombs.forEach(removeBomb);activeBombs=[];$('#bomb-warning').hidden=true}
function spawnBomb(time,x,z,delay=0){
  const marker=new THREE.Group();marker.position.set(x,terrainHeight(x,z)+.1,z);scene.add(marker);
  const disc=mesh(new THREE.CircleGeometry(6.5,32),new THREE.MeshBasicMaterial({color:0xc9221d,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide}),0,.02,0,marker);disc.rotation.x=-Math.PI/2;
  const ring=mesh(new THREE.RingGeometry(6.15,6.55,32),new THREE.MeshBasicMaterial({color:0xff4a30,transparent:true,opacity:.92,depthWrite:false,side:THREE.DoubleSide}),0,.05,0,marker);ring.rotation.x=-Math.PI/2;
  const falling=mesh(new THREE.ConeGeometry(.42,1.5,8),new THREE.MeshStandardMaterial({color:0x282d27,metalness:.35}),0,17,0,marker);falling.rotation.z=Math.PI;
  const fuse=mesh(new THREE.SphereGeometry(.16,6,5),new THREE.MeshBasicMaterial({color:0xffad51}),0,18,0,marker);
  activeBombs.push({x,z,marker,disc,ring,falling,fuse,flightTime:1900+delay,detonateAt:time+1900+delay});
}
function spawnRedzone(time){
  const nearPlayer=rand()<.65;
  const cx=nearPlayer?THREE.MathUtils.clamp(player.position.x+(rand()-.5)*5,-36,36):rand()*72-36;
  const cz=nearPlayer?THREE.MathUtils.clamp(player.position.z+(rand()-.5)*5,-44,40):rand()*84-44;
  for(let i=0;i<4;i++){
    const x=THREE.MathUtils.clamp(cx+(i?(rand()-.5)*20:0),-36,36);
    const z=THREE.MathUtils.clamp(cz+(i?(rand()-.5)*20:0),-44,40);
    spawnBomb(time,x,z,i*260);
  }
  nextBombAt=time+4000+rand()*1500;
  $('#bomb-warning').hidden=false;showToast('REDZONE — 4 QUẢ BOM ĐANG LAO XUỐNG!');audio(740,.25,'sawtooth',.1);
}
function updateBomb(time){
  if(status!=='running'&&status!=='quiz')return;
  if(time>=nextBombAt)spawnRedzone(time);
  for(let i=activeBombs.length-1;i>=0;i--){
    const bomb=activeBombs[i],remaining=Math.max(0,bomb.detonateAt-time);
    bomb.disc.material.opacity=.22+Math.abs(Math.sin(time*.013))*.22;bomb.ring.scale.setScalar(1+Math.sin(time*.017)*.055);
    bomb.falling.position.y=.7+remaining/bomb.flightTime*16.3;bomb.fuse.position.y=bomb.falling.position.y+1;
    if(remaining>0)continue;
    const distance=Math.hypot(player.position.x-bomb.x,player.position.z-bomb.z),blastPoint=new THREE.Vector3(bomb.x,terrainHeight(bomb.x,bomb.z)+.5,bomb.z);
    activeBombs.splice(i,1);removeBomb(bomb);burst(blastPoint,22,0xff873e);battleSound('bomb');
    if(distance<6.5&&time-lastBlastDamageAt>800){lastBlastDamageAt=time;launchPlayer(bomb.x,bomb.z);takeDamage(42,'Trúng bom trong redzone. Hãy chạy khỏi các vòng cảnh báo.');if(status!=='dead')showToast('TRÚNG REDZONE — NHÂN VẬT BỊ HẤT VĂNG!')}
    if(status==='dead')break;
  }
  $('#bomb-warning').hidden=!activeBombs.length;
  if(activeBombs.length)$('#bomb-countdown').textContent=Math.ceil(Math.min(...activeBombs.map(b=>Math.max(0,b.detonateAt-time)))/1000);
}

function launchPlayer(x,z){
  const dx=player.position.x-x,dz=player.position.z-z,length=Math.max(.4,Math.hypot(dx,dz));
  knockback.set(dx/length*12,0,dz/length*12);liftSpeed=8.5;lift=.15;staggerUntil=performance.now()+750;
  hud.damage.classList.add('active');setTimeout(()=>hud.damage.classList.remove('active'),320);
}
function updateKnockback(dt){
  if(!player)return;
  if(!lift&&!knockback.lengthSq()){player.rotation.z*=Math.exp(-8*dt);player.rotation.x*=Math.exp(-8*dt);return}
  player.position.x=THREE.MathUtils.clamp(player.position.x+knockback.x*dt,-38,38);
  player.position.z=THREE.MathUtils.clamp(player.position.z+knockback.z*dt,-46,43);
  knockback.multiplyScalar(Math.exp(-3.6*dt));if(knockback.lengthSq()<.02)knockback.set(0,0,0);
  lift=Math.max(0,lift+liftSpeed*dt);liftSpeed-=24*dt;
  if(lift===0)liftSpeed=0;
  player.position.y=terrainHeight(player.position.x,player.position.z)+lift;
  const tilt=Math.min(1,lift/1.2);player.rotation.z=-knockback.x*.065*tilt;player.rotation.x=knockback.z*.065*tilt;
  if(lift===0){player.rotation.z*=.6;player.rotation.x*=.6}
}

function updatePlayer(dt){if(status!=='running'||performance.now()<staggerUntil)return;let forward=0,side=0;if(keys.has('KeyW')||keys.has('ArrowUp'))forward++;if(keys.has('KeyS')||keys.has('ArrowDown'))forward--;if(keys.has('KeyA')||keys.has('ArrowLeft'))side--;if(keys.has('KeyD')||keys.has('ArrowRight'))side++;forward+=-touchMove.y;side+=touchMove.x;
  const length=Math.hypot(forward,side);if(length>.05){forward/=Math.max(1,length);side/=Math.max(1,length);const running=keys.has('ShiftLeft')||keys.has('ShiftRight'),rate=speed*(running?1.48:1);const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*rate*dt,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*rate*dt;player.position.x=THREE.MathUtils.clamp(player.position.x+dx,-38,38);player.position.z=THREE.MathUtils.clamp(player.position.z+dz,-46,43);motion+=dt*(running?13:9);const legs=player.userData.legs;legs[0].rotation.x=Math.sin(motion)*.38;legs[1].rotation.x=-Math.sin(motion)*.38;player.position.y=terrainHeight(player.position.x,player.position.z)+Math.abs(Math.sin(motion))*.07}else{player.userData.legs.forEach(l=>l.rotation.x*=.75);player.position.y=terrainHeight(player.position.x,player.position.z)}
  player.rotation.y=yaw;
}
function updateCamera(dt,instant=false){if(status==='victory'){camera.position.lerp(new THREE.Vector3(13,11,-25),Math.min(1,dt*2));camera.lookAt(0,6,-49);return}const p=player?.position||new THREE.Vector3(0,0,37),back=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const desired=p.clone().addScaledVector(back,isMobile?7.5:6.8).add(new THREE.Vector3(0,3.4+pitch*5,0));if(instant)camera.position.copy(desired);else camera.position.lerp(desired,Math.min(1,dt*7));const target=p.clone().addScaledVector(back,-8).add(new THREE.Vector3(0,1.8+pitch*4,0));camera.lookAt(target)}
function updateProximity(){if(status!=='running'){hud.prompt.hidden=true;return}let closest=null,best=3.2;for(const c of crates){if(c.opened)continue;const dist=Math.hypot(c.group.position.x-player.position.x,c.group.position.z-player.position.z);if(dist<best){best=dist;closest=c}}nearest=closest;
  hud.prompt.hidden=!closest;if(closest)hud.promptText.textContent=`MỞ THÙNG TIẾP TẾ ${closest.index+1}`;
}
function updateEnemies(dt,time){if(status!=='running'&&status!=='quiz')return;for(const e of enemies){if(!e.alive)continue;
  const position=e.body.position,dist=Math.hypot(player.position.x-position.x,player.position.z-position.z),move=new THREE.Vector3();
  if(dist<9){const sign=e.index%2?1:-1;move.set((position.z-player.position.z)*sign,0,(player.position.x-position.x)*sign).normalize()}
  else if(dist<18){move.set(player.position.x-position.x,0,player.position.z-position.z).normalize();move.x+=Math.sin(time*.0015+e.phase)*.35;move.normalize()}
  else{const targetX=e.anchor.x+Math.sin(time*.0007+e.phase)*4,targetZ=e.anchor.z+Math.cos(time*.0006+e.phase)*3;move.set(targetX-position.x,0,targetZ-position.z);if(move.length()>1)move.normalize()}
  const pace=dist<18?1.15:.9;position.x=THREE.MathUtils.clamp(position.x+move.x*pace*dt,-21,21);position.z=THREE.MathUtils.clamp(position.z+move.z*pace*dt,-43,32);position.y=terrainHeight(position.x,position.z);
  e.walk+=dt*5.5;e.body.userData.legs[0].rotation.x=Math.sin(e.walk)*.24;e.body.userData.legs[1].rotation.x=-Math.sin(e.walk)*.24;
  e.body.rotation.y=dist<20?Math.atan2(player.position.x-position.x,position.z-player.position.z):Math.atan2(move.x,-move.z);
  e.cooldown-=dt;if(e.cooldown<=0&&dist<20){e.cooldown=2.1+rand()*1.7;const from=position.clone().add(new THREE.Vector3(0,1.5,0)),to=player.position.clone().add(new THREE.Vector3(0,1.2,0)),direction=to.sub(from).normalize();const bullet=mesh(new THREE.SphereGeometry(.12,6,5),mats.bullet,from.x,from.y,from.z);enemyBullets.push({mesh:bullet,velocity:direction.multiplyScalar(30),ttl:2.2});battleSound('enemy')}
 }}
function updateBullets(dt){for(let i=enemyBullets.length-1;i>=0;i--){const b=enemyBullets[i],from=b.mesh.position.clone(),step=b.velocity.clone().multiplyScalar(dt);b.mesh.position.add(step);b.ttl-=dt;const center=player.position.clone().add(new THREE.Vector3(0,1.3,0)),along=THREE.MathUtils.clamp(center.clone().sub(from).dot(step)/Math.max(step.lengthSq(),.0001),0,1),closest=from.addScaledVector(step,along);if(closest.distanceTo(center)<.85){takeDamage(status==='quiz'?9:10);b.ttl=0}if(b.ttl<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();enemyBullets.splice(i,1)}}}
function updateEffects(dt,time){for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.ttl-=dt;if(e.velocity){e.mesh.position.addScaledVector(e.velocity,dt);e.velocity.y-=dt*13;e.mesh.scale.multiplyScalar(.97)}if(e.ttl<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1)}}for(const c of crates){if(c.opened)continue;c.marker.position.y=2.1+Math.sin(time*.002+c.index)*.17;c.marker.rotation.y+=dt*1.6;c.ring.rotation.z+=dt*.35}
  if(flagGroup?.visible&&flagMesh){const pos=flagMesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i);pos.setZ(i,Math.sin(time*.004+x*1.3)*.22*(x/4))}pos.needsUpdate=true;flagMesh.geometry.computeVertexNormals()}}
function drawMap(){const canvas=$('#minimap'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#536248';ctx.fillRect(0,0,w,h);ctx.fillStyle='#8f815d';ctx.fillRect(69,0,22,h);ctx.strokeStyle='#d6c79e88';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(80,0);ctx.lineTo(80,h);ctx.stroke();ctx.setLineDash([]);const project=(x,z)=>({x:w/2+x/90*w,y:(50-z)/100*h});
  const bunkerPoint=project(0,-49);ctx.fillStyle='#d6b775';ctx.fillRect(bunkerPoint.x-6,bunkerPoint.y-4,12,8);
  for(const c of crates){if(c.opened)continue;const p=project(c.group.position.x,c.group.position.z);ctx.fillStyle='#69d9df';ctx.fillRect(p.x-3,p.y-3,6,6)}
  for(const e of enemies){if(!e.alive)continue;const p=project(e.body.position.x,e.body.position.z);ctx.fillStyle='#f0785a';ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill()}
  for(const bomb of activeBombs){const b=project(bomb.x,bomb.z);ctx.strokeStyle='#ff4538';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,12,0,Math.PI*2);ctx.stroke()}
  const p=project(player.position.x,player.position.z);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(yaw);ctx.fillStyle='#ffdf7c';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();ctx.restore()}
function tick(time){if(!renderer||document.hidden)return;const dt=Math.min(.045,lastTime?(time-lastTime)/1000:.016);lastTime=time;
  if(status==='running')updatePlayer(dt);updateEnemies(dt,time);updateBullets(dt);updateBomb(time);updateKnockback(dt);updateCamera(dt);updateEffects(dt,time);
  if(soundEnabled&&(status==='running'||status==='quiz')&&time>=nextBattleSoundAt){battleSound('distant');nextBattleSoundAt=time+5000+rand()*7000}
  if(status==='quiz'){const remaining=Math.max(0,Math.ceil((quizDeadline-performance.now())/1000));hud.quizTimer.textContent=`${remaining}s`;if(remaining<=0)die('Hết thời gian giải mã tiếp tế. Hỏa lực đối phương đã áp sát.')}
  if(time-hudTime>100){updateProximity();hudTime=time}if(time-miniTime>180){drawMap();miniTime=time}
  renderer.render(scene,camera);
}

function bindControls(){document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>setRole(button.dataset.role)));$('#start-btn').addEventListener('click',startGame);
  hud.quizOptions.addEventListener('click',event=>{const answerButton=event.target.closest('[data-answer]');if(answerButton)answer(Number(answerButton.dataset.answer))});
  $('#sound-btn').addEventListener('click',()=>setBattleSound(!soundEnabled));
  addEventListener('keydown',event=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();keys.add(event.code);if(event.repeat)return;if(status==='quiz'&&['Digit1','Digit2','Digit3','Digit4'].includes(event.code)){answer(Number(event.code.slice(-1))-1);return}if(event.code==='KeyE')interact();if(event.code==='KeyR')reload();if(event.code==='Space')fire()});addEventListener('keyup',event=>keys.delete(event.code));
  worldEl.addEventListener('click',()=>{if(status!=='running')return;if(document.pointerLockElement===renderer.domElement)fire();else renderer.domElement.requestPointerLock?.()});
  document.addEventListener('mousemove',event=>{if(document.pointerLockElement!==renderer.domElement||status!=='running')return;yaw-=event.movementX*.0026;pitch=THREE.MathUtils.clamp(pitch-event.movementY*.0018,-.2,.46)});
  const joy=$('#joystick'),knob=$('#joystick-knob');let joyPointer=null;joy.addEventListener('pointerdown',event=>{joyPointer=event.pointerId;joy.setPointerCapture(event.pointerId)});joy.addEventListener('pointermove',event=>{if(event.pointerId!==joyPointer)return;const r=joy.getBoundingClientRect(),x=event.clientX-(r.left+r.width/2),y=event.clientY-(r.top+r.height/2),mag=Math.max(1,Math.hypot(x,y)),max=26;touchMove={x:Math.max(-1,Math.min(1,x/max)),y:Math.max(-1,Math.min(1,y/max))};knob.style.transform=`translate(${x/mag*Math.min(mag,max)}px,${y/mag*Math.min(mag,max)}px)`});const endJoy=()=>{joyPointer=null;touchMove={x:0,y:0};knob.style.transform=''};joy.addEventListener('pointerup',endJoy);joy.addEventListener('pointercancel',endJoy);
  worldEl.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'||event.clientX<innerWidth*.35)return;touchLookId=event.pointerId;worldEl.setPointerCapture(event.pointerId);worldEl.dataset.x=event.clientX;worldEl.dataset.y=event.clientY});worldEl.addEventListener('pointermove',event=>{if(event.pointerId!==touchLookId||status!=='running')return;yaw-=(event.clientX-Number(worldEl.dataset.x))*.006;pitch=THREE.MathUtils.clamp(pitch-(event.clientY-Number(worldEl.dataset.y))*.004,-.2,.46);worldEl.dataset.x=event.clientX;worldEl.dataset.y=event.clientY});worldEl.addEventListener('pointerup',()=>touchLookId=null);
  $('#mobile-interact').addEventListener('click',interact);$('#mobile-fire').addEventListener('pointerdown',event=>{event.preventDefault();fire()});$('#mobile-reload').addEventListener('click',reload);
}
if(initRenderer())bindControls();
// Try at page load, then retry on the first interaction if autoplay is blocked.
setBattleSound(true);
document.addEventListener('pointerdown',event=>{if(soundEnabled&&backgroundMusic.paused&&!event.target.closest('#sound-btn'))backgroundMusic.play().catch(()=>{})},{capture:true});
document.addEventListener('keydown',()=>{if(soundEnabled&&backgroundMusic.paused)backgroundMusic.play().catch(()=>{})},{capture:true});
