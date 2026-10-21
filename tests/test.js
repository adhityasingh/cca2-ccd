// Automated tests for the Skyline Air flight booking website (index.html).
// Jenkins runs this file in the "Build and Test" stage.
// It loads the page's JavaScript into a fake browser page, then simulates a user:
// search flights -> book seats -> check seats left -> cancel a booking.
// If any check fails the script exits with code 1 and the pipeline stops.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log('PASS: ' + name); passed++; }
  else { console.log('FAIL: ' + name); failed++; }
}
function finish() {
  console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

// ---------- 1. Read index.html and check its structure ----------
const file = path.join(__dirname, '..', 'index.html');
check('index.html exists', fs.existsSync(file));
if (!fs.existsSync(file)) finish();
const html = fs.readFileSync(file, 'utf8');
check('has <title> tag', /<title>[\s\S]*?<\/title>/i.test(html));
check('page mentions "Skyline Air"', html.includes('Skyline Air'));
['search', 'from', 'to', 'date', 'results', 'bookings', 'bookForm', 'pax', 'message'].forEach(function (id) {
  check('has element with id "' + id + '"', html.includes('id="' + id + '"'));
});

// ---------- 2. JavaScript syntax check ----------
const scripts = [];
const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = scriptRegex.exec(html)) !== null) {
  if (!/\bsrc\s*=/i.test(m[1]) && m[2].trim() !== '') scripts.push(m[2]);
}
check('page has an inline script', scripts.length > 0);
if (scripts.length === 0) finish();
try { new vm.Script(scripts.join('\n')); check('JavaScript syntax is valid', true); }
catch (err) { console.log('  ' + err.message); check('JavaScript syntax is valid', false); finish(); }

// ---------- 3. Build a fake browser page ----------
const elements = {};
function makeElement(id) {
  const listeners = {};
  return {
    id: id, value: '', innerHTML: '', textContent: '', min: '', dataset: {},
    addEventListener: function (type, fn) { listeners[type] = fn; },
    trigger: function (type, event) { return listeners[type](event || { preventDefault: function () {}, target: { dataset: {} } }); },
    showModal: function () { this.open = true; },
    close: function () { this.open = false; },
    open: false
  };
}
const fakeDocument = {
  getElementById: function (id) { if (!elements[id]) elements[id] = makeElement(id); return elements[id]; }
};
const store = {};
const fakeStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); }
};
const sandbox = { document: fakeDocument, localStorage: fakeStorage, console: console };
vm.createContext(sandbox);

try { vm.runInContext(scripts.join('\n'), sandbox); check('page script loads and starts without errors', true); }
catch (err) { console.log('  ' + err.message); check('page script loads and starts without errors', false); finish(); }

const el = function (id) { return fakeDocument.getElementById(id); };
const get = function (expr) { return vm.runInContext(expr, sandbox); };   // read a variable from the page script
const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

function doSearch(from, to) {
  el('from').value = from; el('to').value = to; el('date').value = nextWeek;
  el('search').trigger('submit');
}
function book(flightId, pax) {
  el('results').trigger('click', { target: { dataset: { flight: flightId } } });
  el('name').value = 'Test User'; el('email').value = 'test@example.com'; el('pax').value = String(pax);
  el('bookForm').trigger('submit');
}

// ---------- 4. Page start-up ----------
check('airport lists are filled (6 airports)', (el('from').innerHTML.match(/<option/g) || []).length === 6);
check('default route is Pune to Delhi', el('from').value === 'PNQ' && el('to').value === 'DEL');
check('starts with no bookings', get('bookings.length') === 0);

// ---------- 5. Search ----------
doSearch('PNQ', 'BLR');
check('search Pune to Bengaluru shows flight SK201', el('results').innerHTML.includes('SK201'));
check('search Pune to Bengaluru shows flight SK203', el('results').innerHTML.includes('SK203'));
check('search does not show flights of other routes', !el('results').innerHTML.includes('SK101'));
check('message says 2 flights found', el('message').textContent.includes('2 flights'));
check('a flight starts with 60 seats left', el('results').innerHTML.includes('60 seats left'));

doSearch('PNQ', 'PNQ');
check('same From and To airport is rejected', el('message').textContent.includes('different airports'));

doSearch('HYD', 'PNQ');
check('route with no flights shows a message', el('message').textContent.includes('No flights'));

// ---------- 6. Booking ----------
doSearch('PNQ', 'BLR');
book('SK201', 2);
check('booking is saved (1 booking)', get('bookings.length') === 1);
check('total price is correct (2 x 3900 = 7800)', get('bookings[0].total') === 7800);
check('booking is stored in localStorage', JSON.parse(store['skyline-bookings']).length === 1);
check('seat count drops to 58', el('results').innerHTML.includes('58 seats left'));
check('booking appears in "Your bookings"', el('bookings').innerHTML.includes('Cancel booking'));
const pnr = get('bookings[0].pnr');
check('confirmation code is 6 characters', typeof pnr === 'string' && pnr.length === 6);
check('confirmation code is shown in "Your bookings"', el('bookings').innerHTML.includes(pnr));

// invalid passenger count
book('SK201', 7);
check('more than 6 passengers is rejected', get('bookings.length') === 1 && el('formError').textContent.includes('1 and 6'));

// fill the flight: 58 seats left -> 9 bookings of 6 = 54, then 4 left
for (let i = 0; i < 9; i++) book('SK201', 6);
check('seat count drops to 4', el('results').innerHTML.includes('4 seats left'));
book('SK201', 6);
check('booking more seats than available is rejected', el('formError').textContent.includes('Not enough seats'));
book('SK201', 4);
check('flight shows "Sold out" when full', el('results').innerHTML.includes('Sold out'));

// ---------- 7. Cancel ----------
const before = get('bookings.length');
el('bookings').trigger('click', { target: { dataset: { cancel: pnr } } });
check('cancel removes exactly one booking', get('bookings.length') === before - 1);
check('cancelled booking is gone from localStorage', !store['skyline-bookings'].includes(pnr));
check('cancelled booking disappears from "Your bookings"', !el('bookings').innerHTML.includes(pnr));
check('seats are released after cancel (sold out disappears)', !el('results').innerHTML.includes('Sold out'));

finish();
