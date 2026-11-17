// Gestión de Sesión (Nombre + Gmail), Dinero y Colección de Autos
const AuthManager = (() => {
  const STORAGE_KEY = 'apex_horizon_ultimate_v2';
  let currentUser = null;

  function createDefaultCarInstance(modelId = 'skyline_gtr') {
    const model = CarCatalog.getById(modelId);
    return {
      uid: 'car_' + Math.random().toString(36).substring(2, 9),
      modelId: model.id,
      color: model.defaultColor,
      finish: 'metallic',
      neon: 'none',
      spoiler: 'street',
      rimColor: '#e2e8f0',
      engineLvl: 1,
      transLvl: 1, // Nv 1..4 = 7 marchas | Nv 5 (Full) = 10 marchas
      tiresLvl: 1,
      nitroLvl: 1
    };
  }

  function loadUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) {
      currentUser = null;
    }
    return currentUser;
  }

  function saveUser() {
    if (!currentUser) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
    fetch('api/rooms.php?action=save_profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentUser)
    }).catch(() => {});
  }

  function login(name, email) {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 3) {
      return { ok: false, msg: 'El nombre debe tener al menos 3 caracteres.' };
    }
    if (!cleanEmail.includes('@')) {
      return { ok: false, msg: 'Ingresa un correo Gmail válido (ejemplo@gmail.com).' };
    }

    const existing = loadUser();
    if (existing && existing.email === cleanEmail && Array.isArray(existing.garage)) {
      existing.name = cleanName;
      currentUser = existing;
    } else {
      const starter = createDefaultCarInstance('skyline_gtr');
      currentUser = {
        id: 'plr_' + Math.random().toString(36).substring(2, 9),
        name: cleanName,
        email: cleanEmail,
        credits: 21500,
        activeCarUid: starter.uid,
        garage: [starter]
      };
    }
    saveUser();
    return { ok: true, user: currentUser };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    currentUser = null;
  }

  function getUser() {
    return currentUser || loadUser();
  }

  function getActiveCar() {
    const u = getUser();
    if (!u || !u.garage || u.garage.length === 0) return null;
    return u.garage.find(c => c.uid === u.activeCarUid) || u.garage[0];
  }

  function buyCar(modelId) {
    const u = getUser();
    const model = CarCatalog.getById(modelId);
    if (!u || u.credits < model.price) return { ok: false, msg: 'Dinero insuficiente.' };
    u.credits -= model.price;
    const newCar = createDefaultCarInstance(modelId);
    u.garage.push(newCar);
    u.activeCarUid = newCar.uid;
    saveUser();
    return { ok: true, car: newCar };
  }

  function sellCar(carUid) {
    const u = getUser();
    if (!u || u.garage.length <= 1) {
      return { ok: false, msg: 'Debes conservar al menos 1 auto en tu garaje.' };
    }
    const idx = u.garage.findIndex(c => c.uid === carUid);
    if (idx === -1) return { ok: false, msg: 'Auto no encontrado.' };

    const value = CarCatalog.calculateResaleValue(u.garage[idx]);
    u.garage.splice(idx, 1);
    u.credits += value;
    u.activeCarUid = u.garage[0].uid;
    saveUser();
    return { ok: true, earned: value };
  }

  return { loadUser, saveUser, login, logout, getUser, getActiveCar, buyCar, sellCar };
})();
