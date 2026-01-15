// --- CONFIG & SUPABASE ---
const SU_URL = 'https://hcmvgcbyjghmtvjzzyja.supabase.co';
// Вставляем твой ключ одной строкой, чтобы не было ошибок
const SU_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbXZnY2J5amdobXR2anp6eWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NzIwMjYsImV4cCI6MjA4NDA0ODAyNn0.Hss-SP6CDrmdMn0QrrTNG0Moyecwz4iKIGt9W8zvFHM';

let supabase = null;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SU_URL, SU_KEY);
        console.log("Supabase init OK");
    }
} catch (e) {
    console.error("Supabase fail:", e);
}

// TELEGRAM INIT
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    // Красим шапку
    tg.setHeaderColor('#1a1b26');
}

// GAME DATA
const SKINS = {
    'default': { name: 'Тишка', cost: 0, svg: '' },
    'glasses': { name: 'Крутой', cost: 20000, svg: '<g><circle cx="65" cy="90" r="24" fill="rgba(0,0,0,0.5)" stroke="white" stroke-width="2"/><circle cx="135" cy="90" r="24" fill="rgba(0,0,0,0.5)" stroke="white" stroke-width="2"/></g>' },
    'crown': { name: 'Король', cost: 50000, svg: '<path d="M70 50 L60 20 L85 40 L100 10 L115 40 L140 20 L130 50 Z" fill="#FFD700" stroke="#DAA520" stroke-width="2" transform="translate(0, -15)"/>' }
};

// INITIAL STATE
let state = JSON.parse(localStorage.getItem('TishkaV7_Ult')) || {
    playerId: generateId(),
    coins: 0, clickPower: 1, autoPower: 0, energy: 1000, maxEnergy: 1000,
    costs: { click: 10, auto: 50, max: 200 }, prestige: 0, multiplier: 1,
    skinsOwned: ['default'], currentSkin: 'default', pets: [],
    stats: { totalClicks: 0, bossesKilled: 0 },
    lastSaveTime: Date.now(),
    daily: { streak: 0, lastClaimTime: 0 },
    boss: { damage: 200, level: 1 },
    factory: { cows: 0, milk: 0, truckLevel: 1, truckMax: 50 }
};

// HELPER: Generate simple ID
function generateId() {
    return 'user_' + Math.floor(Math.random() * 1000000);
}

// --- CLOUD FUNCTIONS ---
async function saveToCloud() {
    if (!supabase) {
        setStatus("☁️ Ошибка скрипта");
        return;
    }
    
    setStatus("☁️ Сохр...");
    
    try {
        // Проверяем ID, если он пришел от Телеграма
        let uid = state.playerId;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            uid = tg.initDataUnsafe.user.id.toString();
        }

        const { error } = await supabase
            .from('players')
            .upsert({ 
                id: uid, 
                save_data: state, 
                updated_at: new Date() 
            });

        if (error) {
            console.error(error);
            setStatus("☁️ Ошибка (RLS?)", "red");
        } else {
            setStatus("☁️ ОК", "#00ff00");
        }
    } catch (e) {
        console.error(e);
        setStatus("☁️ Сбой", "red");
    }
}

async function loadFromCloud() {
    if (!supabase) return;
    
    let uid = state.playerId;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        uid = tg.initDataUnsafe.user.id.toString();
        state.playerId = uid; // Sync ID
    }

    const { data, error } = await supabase
        .from('players')
        .select('save_data')
        .eq('id', uid)
        .single();

    if (data && data.save_data) {
        // Merge cloud save with local to prevent version errors
        state = { ...state, ...data.save_data };
        updateUI();
        renderSkins();
        console.log("Loaded from cloud!");
    }
}

function setStatus(text, color) {
    const el = document.getElementById('cloud-status');
    if (el) {
        el.innerText = text;
        if (color) el.style.color = color;
    }
}

window.testConnection = async function() {
    if (!supabase) return alert("Ошибка: Библиотека Supabase не загрузилась!");
    alert("Отправка тестового запроса...");
    try {
        const { data, error } = await supabase.from('players').select('count').limit(1);
        if (error && error.code !== 'PGRST116') {
            alert("ОШИБКА БАЗЫ:\n" + error.message + "\n\nСовет: Проверь, отключил ли ты RLS?");
        } else {
            alert("✅ УСПЕХ! База подключена и работает.");
            saveToCloud();
        }
    } catch (e) {
        alert("Критическая ошибка: " + e.message);
    }
};

function save() {
    state.lastSaveTime = Date.now();
    localStorage.setItem('TishkaV7_Ult', JSON.stringify(state));
    // Сохраняем в облако раз в 5 секунд (debounce)
    // Вызываем saveToCloud не чаще чем раз в пару секунд, но для простоты:
    saveToCloud(); 
}

// --- GAME LOGIC ---
function updateUI() {
    document.getElementById('h-coins').innerText = Math.floor(state.coins);
    document.getElementById('energy-val').innerText = Math.floor(state.energy);
    document.getElementById('max-energy-val').innerText = state.maxEnergy;
    document.getElementById('energy-bar').style.width = (state.energy / state.maxEnergy * 100) + '%';
    
    // Shop buttons
    document.getElementById('btn-click').innerText = `${state.costs.click}💰 (Ур.${state.clickPower})`;
    document.getElementById('btn-auto').innerText = `${state.costs.auto}💰 (+${state.autoPower}/с)`;
    document.getElementById('btn-max').innerText = `${state.costs.max}💰`;
    
    // Check buttons availability
    document.getElementById('btn-click').disabled = state.coins < state.costs.click;
    document.getElementById('btn-auto').disabled = state.coins < state.costs.auto;
    document.getElementById('btn-max').disabled = state.coins < state.costs.max;

    // Boss
    if (document.getElementById('boss-dmg-val')) {
        document.getElementById('boss-dmg-val').innerText = state.boss.damage;
    }
    
    // Player ID
    if (document.getElementById('player-id')) {
        document.getElementById('player-id').innerText = state.playerId;
    }
}

// Global functions for buttons
window.clickCoin = function(e) {
    if (state.energy < 1) return;
    let gain = state.clickPower * state.multiplier;
    state.coins += gain;
    state.energy--;
    state.stats.totalClicks++;
    spawnText(e.clientX, e.clientY, "+" + gain);
    updateUI();
};

window.buy = function(type) {
    if (state.coins >= state.costs[type]) {
        state.coins -= state.costs[type];
        state.costs[type] = Math.floor(state.costs[type] * 1.5);
        if (type === 'click') state.clickPower++;
        if (type === 'auto') state.autoPower++;
        if (type === 'max') state.maxEnergy += 250;
        updateUI();
        save();
    }
};

window.switchTab = function(id, btn) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    
    // Show/Hide energy bar
    const energyBar = document.querySelector('.energy-float-bar');
    if (energyBar) energyBar.style.display = (id === 'game') ? 'flex' : 'none';
};

window.openModal = function(id) { document.getElementById(id).classList.add('open'); };
window.closeModal = function(id) { document.getElementById(id).classList.remove('open'); };

// Skins logic
window.switchShopTab = function(type, btn) {
    document.querySelectorAll('.shop-section').forEach(e => e.classList.remove('active'));
    document.getElementById('shop-' + type).classList.add('active');
    document.querySelectorAll('.shop-tab-btn').forEach(e => e.classList.remove('active'));
    btn.classList.add('active');
}

function renderSkins() {
    const grid = document.getElementById('skins-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let k in SKINS) {
        let s = SKINS[k];
        let owned = state.skinsOwned.includes(k);
        let txt = owned ? (state.currentSkin === k ? 'Надето' : 'Надеть') : s.cost + '💰';
        let cls = owned && state.currentSkin === k ? 'buy-btn equipped' : 'buy-btn';
        
        grid.innerHTML += `
        <div class="card">
            <div style="display:flex;align-items:center;">
                <div class="card-icon">👕</div>
                <div class="card-info"><h4>${s.name}</h4></div>
            </div>
            <button class="${cls}" onclick="buySkin('${k}')">${txt}</button>
        </div>`;
    }
    // Update SVG
    const svgLayer = document.getElementById('skin-layer');
    if (svgLayer && SKINS[state.currentSkin]) {
        svgLayer.innerHTML = SKINS[state.currentSkin].svg;
    }
}

window.buySkin = function(k) {
    if (state.skinsOwned.includes(k)) {
        state.currentSkin = k;
    } else if (state.coins >= SKINS[k].cost) {
        state.coins -= SKINS[k].cost;
        state.skinsOwned.push(k);
        state.currentSkin = k;
    }
    renderSkins();
    updateUI();
    save();
}

// Effects
function spawnText(x, y, text) {
    let el = document.createElement('div');
    el.className = 'floating-num';
    el.innerText = text;
    el.style.left = (x - 20) + 'px';
    el.style.top = (y - 50) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// Loops
setInterval(() => {
    if (state.autoPower > 0) {
        state.coins += state.autoPower;
        updateUI();
    }
    if (state.energy < state.maxEnergy) state.energy += 5;
}, 1000);

// Auto-save loop
setInterval(save, 5000);

// INIT
loadFromCloud();
updateUI();
renderSkins();