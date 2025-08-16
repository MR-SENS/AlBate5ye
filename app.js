// ===== Google Sheets Integration =====
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyejlpjNwZof-AymZHQk4YReEznHIJL0eVV6EMaP6iv4TWAjRR_94XS1iXdaGZgGCE/exec';

// Function to send data to Google Sheets
async function sendToGoogleSheets(data, sheetName) {
  try {
    const payload = {
      ...data,
      sheet: sheetName
    };

    const response = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`Data sent successfully to ${sheetName} sheet`);
      return true;
    } else {
      console.error(`Failed to send data to ${sheetName} sheet:`, response.status);
      return false;
    }
  } catch (error) {
    console.error(`Error sending data to ${sheetName} sheet:`, error);
    return false;
  }
}

// ===== أدوات صغيرة =====
const $ = (s, p=document)=>p.querySelector(s);
const $$ = (s, p=document)=>Array.from(p.querySelectorAll(s));
const fmt = n => new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(n||0);
const todayStr = ()=> new Date().toISOString().slice(0,10);

// ===== ثيم وتاريخ =====
const applyTheme = () => {
  const t = localStorage.getItem('wb_theme') || 'light';
  if(t==='dark') document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
};
applyTheme();
$('#themeToggle').onclick = () => {
  const now = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  localStorage.setItem('wb_theme', now);
  applyTheme();
};
$('#today').textContent = new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

// ===== قاعدة البيانات (LocalStorage) =====
const DBKEY = 'bateekhi_db_v3';
const blank = { clients:[], cars:[], maintenance:[], revenue:[], expenses:[] };
const loadDB = () => {
  try { return JSON.parse(localStorage.getItem(DBKEY)) || structuredClone(blank); }
  catch { return structuredClone(blank); }
};
const saveDB = () => localStorage.setItem(DBKEY, JSON.stringify(db));
let db = loadDB();
const nextId = arr => (arr.length? Math.max(...arr.map(x=>x.id||0))+1 : 1);

// ===== تنقل الشاشات =====
$$('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    $$('.nav-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    $$('.screen').forEach(s=>s.classList.remove('active'));
    $('#'+item.dataset.screen).classList.add('active');
    refreshAll();
  });
});

// ===== زر الإضافة الموحد =====
$('#allDate').value = todayStr();
$('#saveAll').onclick = ()=>{
  const name = $('#allName').value.trim();
  const phone = $('#allPhone').value.trim();
  const plate = $('#allPlate').value.trim();
  const model = $('#allModel').value.trim();
  const date = $('#allDate').value || todayStr();
  const type = $('#allType').value;
  const notes = $('#allNotes').value.trim();
  const price = +($('#allPrice').value||0);

  if(!name || !phone || !plate || !model || !type) return alert('⚠️ من فضلك أكمل الحقول المطلوبة');

  // ابحث عن العميل بالتليفون (الأكثر ثباتاً)
  let client = db.clients.find(c=>c.phone===phone);
  if(!client){
    client = { id:nextId(db.clients), name, phone };
    db.clients.push(client);
  }else{
    // حدث الاسم لو فاضي أو مختلف (اختياري)
    if(client.name !== name && name.length>=2) client.name = name;
  }

  // السيارة: امنع التكرار باللوحة
  let car = db.cars.find(c=>c.plate===plate);
  if(!car){
    car = { id:nextId(db.cars), clientId:client.id, plate, model };
    db.cars.push(car);
  }else{
    // لو العربية موجودة وموديل جديد اتحدث
    if(model && car.model!==model) car.model = model;
    // اربطها بصاحبها الحالي لو مختلف
    if(car.clientId !== client.id) car.clientId = client.id;
  }

  // الصيانة
  db.maintenance.push({ id:nextId(db.maintenance), carId:car.id, date, type, notes });

  // الإيراد (لو فيه سعر)
  if(price>0){
    db.revenue.push({ id:nextId(db.revenue), clientId:client.id, carId:car.id, amount:price, date, desc:notes });
  }

  saveDB();
  
  // Send data to Google Sheets
  const sheetsData = {
    // Client data
    clientName: name,
    clientPhone: phone,
    clientDate: date,
    
    // Car data
    carPlate: plate,
    carModel: model,
    carDate: date,
    
    // Maintenance data
    maintenanceType: type,
    maintenanceNotes: notes,
    maintenanceDate: date,
    
    // Revenue data (if price exists)
    revenueAmount: price > 0 ? price : null,
    revenueDate: date,
    revenueDesc: notes
  };
  
  // Send to multiple sheets
  const promises = [];
  
  // Send client data
  promises.push(sendToGoogleSheets({
    name: name,
    phone: phone,
    date: date
  }, "العملاء"));
  
  // Send car data
  promises.push(sendToGoogleSheets({
    plate: plate,
    model: model,
    clientName: name,
    clientPhone: phone,
    date: date
  }, "السيارات"));
  
  // Send maintenance data
  promises.push(sendToGoogleSheets({
    type: type,
    notes: notes,
    carPlate: plate,
    carModel: model,
    clientName: name,
    date: date
  }, "الصيانة"));
  
  // Send revenue data if price exists
  if (price > 0) {
    promises.push(sendToGoogleSheets({
      amount: price,
      date: date,
      desc: notes,
      clientName: name,
      carPlate: plate,
      carModel: model
    }, "الإيرادات"));
  }
  
  // Wait for all Google Sheets operations to complete
  Promise.all(promises).then(results => {
    const successCount = results.filter(result => result === true).length;
    if (successCount === results.length) {
      alert('✅ تمت إضافة العملية بنجاح\nتم الحفظ في Google Sheets بنجاح!');
    } else {
      alert('✅ تمت إضافة العملية بنجاح\n⚠️ حدث خطأ في حفظ بعض البيانات في Google Sheets');
    }
  }).catch(() => {
    alert('✅ تمت إضافة العملية بنجاح\n⚠️ حدث خطأ في حفظ البيانات في Google Sheets');
  });
  
  // فضي الفورم السريع
  ['allName','allPhone','allPlate','allModel','allNotes','allPrice'].forEach(id=> $('#'+id).value='');
  $('#allDate').value = todayStr();
  refreshAll();
};

// ===== إدارة المصروفات =====
$('#addExpenseBtn').onclick = () => {
  $('#expenseForm').style.display = 'grid';
  $('#expenseDate').value = todayStr();
  $('#expenseAmount').focus();
};

$('#cancelExpense').onclick = () => {
  $('#expenseForm').style.display = 'none';
  // فضي الفورم
  ['expenseAmount', 'expenseDate', 'expenseType', 'expenseNotes'].forEach(id => $('#'+id).value = '');
  $('#expenseDate').value = todayStr();
};

$('#saveExpense').onclick = () => {
  const amount = +($('#expenseAmount').value || 0);
  const date = $('#expenseDate').value;
  const type = $('#expenseType').value;
  const notes = $('#expenseNotes').value.trim();

  if (!amount || amount <= 0) return alert('⚠️ من فضلك أدخل مبلغ صحيح');
  if (!date) return alert('⚠️ من فضلك أدخل التاريخ');

  const newExpense = {
    id: nextId(db.expenses),
    amount: amount,
    date: date,
    type: type,
    notes: notes
  };

  db.expenses.push(newExpense);
  saveDB();
  
  // Send expense data to Google Sheets
  sendToGoogleSheets({
    amount: amount,
    date: date,
    type: type,
    notes: notes
  }, "المصروفات").then(success => {
    if (success) {
      alert('✅ تم إضافة المصروف بنجاح\nتم الحفظ في Google Sheets بنجاح!');
    } else {
      alert('✅ تم إضافة المصروف بنجاح\n⚠️ حدث خطأ في حفظ البيانات في Google Sheets');
    }
  }).catch(() => {
    alert('✅ تم إضافة المصروف بنجاح\n⚠️ حدث خطأ في حفظ البيانات في Google Sheets');
  });
  
  // فضي الفورم وأخفي
  $('#cancelExpense').click();
  refreshAll();
};

// ===== بحث سريع عام =====
function enableSearch(inputId, tableBodyId) {
  const input = $(inputId);
  const tbody = $(tableBodyId);
  if(!input || !tbody) return;
  input.addEventListener('input', ()=>{
    const query = input.value.toLowerCase();
    $$('tr', tbody).forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  });
}

// ===== عرض البيانات =====
function renderClients(){
  const tbody = $('#clientsBody');
  if(!tbody) return;
  
  let filteredClients = filterClientsByPeriod(currentClientsFilter);
  
  tbody.innerHTML = filteredClients.map((c,i) => {
    const cars = db.cars.filter(car => car.clientId === c.id).length;
    return `<tr><td>${i+1}</td><td>${c.name}</td><td>${c.phone}</td><td>${cars}</td></tr>`;
  }).join('');
  
  // تحديث ملخص العملاء
  updateClientsSummary(filteredClients);
}

function renderCars(){
  const tbody = $('#carsBody');
  if(!tbody) return;
  
  let filteredCars = filterCarsByPeriod(currentCarsFilter);
  
  tbody.innerHTML = filteredCars.map((c,i) => {
    const client = db.clients.find(cl => cl.id === c.clientId);
    const maintCount = db.maintenance.filter(m => m.carId === c.id).length;
    return `<tr><td>${i+1}</td><td>${c.plate}</td><td>${c.model}</td><td>${client?.name || 'غير محدد'}</td><td>${maintCount}</td><td><button onclick="showCarDetails(${c.id})" class="btn btn-sm btn-primary">👁️ عرض</button></td></tr>`;
  }).join('');
  
  // تحديث ملخص السيارات
  updateCarsSummary(filteredCars);
}

function renderMaintenance(){
  const tbody = $('#maintBody');
  if(!tbody) return;
  
  let filteredMaintenance = filterMaintenanceByPeriod(currentMaintenanceFilter);
  
  tbody.innerHTML = filteredMaintenance.map((m,i) => {
    const car = db.cars.find(c => c.id === m.carId);
    const client = car ? db.clients.find(cl => cl.id === car.clientId) : null;
    return `<tr><td>${i+1}</td><td>${m.date}</td><td>${m.type}</td><td>${car?.plate || 'غير محدد'} - ${client?.name || 'غير محدد'}</td><td>${m.notes || '-'}</td></tr>`;
  }).join('');
  
  // تحديث ملخص الصيانة
  updateMaintenanceSummary(filteredMaintenance);
}

// ===== متغيرات التجميع =====
let currentRevenueFilter = 'daily'; // daily, weekly, monthly
let currentClientsFilter = 'daily'; // daily, monthly, yearly
let currentCarsFilter = 'daily'; // daily, monthly, yearly
let currentMaintenanceFilter = 'daily'; // daily, monthly, yearly
let currentExpensesFilter = 'daily'; // daily, monthly, yearly
let currentAccountingFilter = 'daily'; // daily, monthly, yearly

// ===== عرض الإيرادات مع التجميع =====
function renderRevenue(){
  const tbody = $('#revBody');
  if(!tbody) return;
  
  let filteredRevenue = filterRevenueByPeriod(currentRevenueFilter);
  
  // ترتيب حسب التاريخ (الأحدث أولاً)
  filteredRevenue.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  tbody.innerHTML = filteredRevenue.map((r,i) => {
    const client = db.clients.find(cl => cl.id === r.clientId);
    const car = db.cars.find(c => c.id === r.carId);
    return `<tr><td>${i+1}</td><td>${client?.name || 'غير محدد'}</td><td>${car?.plate || 'غير محدد'}</td><td>${fmt(r.amount)} ج.م</td><td>${r.date}</td><td>${r.desc || '-'}</td></tr>`;
  }).join('');
  
  // تحديث ملخص الإيرادات
  updateRevenueSummary(filteredRevenue);
}

// ===== فلترة البيانات حسب الفترة =====
function filterClientsByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return db.clients.filter(c => {
        const clientCars = db.cars.filter(car => car.clientId === c.id);
        return clientCars.some(car => {
          const maintenance = db.maintenance.filter(m => m.carId === car.id);
          return maintenance.some(m => m.date === todayStr);
        });
      });
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return db.clients.filter(c => {
        const clientCars = db.cars.filter(car => car.clientId === c.id);
        return clientCars.some(car => {
          const maintenance = db.maintenance.filter(m => m.carId === car.id);
          return maintenance.some(m => {
            const maintDate = new Date(m.date);
            return maintDate >= monthAgo && maintDate <= today;
          });
        });
      });
    
    case 'yearly':
      const yearAgo = new Date(today.getFullYear(), 0, 1);
      return db.clients.filter(c => {
        const clientCars = db.cars.filter(car => car.clientId === c.id);
        return clientCars.some(car => {
          const maintenance = db.maintenance.filter(m => m.carId === car.id);
          return maintenance.some(m => {
            const maintDate = new Date(m.date);
            return maintDate >= yearAgo && maintDate <= today;
          });
        });
      });
    
    default:
      return db.clients;
  }
}

function filterCarsByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return db.cars.filter(c => {
        const maintenance = db.maintenance.filter(m => m.carId === c.id);
        return maintenance.some(m => m.date === todayStr);
      });
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return db.cars.filter(c => {
        const maintenance = db.maintenance.filter(m => m.carId === c.id);
        return maintenance.some(m => {
          const maintDate = new Date(m.date);
          return maintDate >= monthAgo && maintDate <= today;
        });
      });
    
    case 'yearly':
      const yearAgo = new Date(today.getFullYear(), 0, 1);
      return db.cars.filter(c => {
        const maintenance = db.maintenance.filter(m => m.carId === c.id);
        return maintenance.some(m => {
          const maintDate = new Date(m.date);
          return maintDate >= yearAgo && maintDate <= today;
        });
      });
    
    default:
      return db.cars;
  }
}

function filterMaintenanceByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return db.maintenance.filter(m => m.date === todayStr);
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return db.maintenance.filter(m => {
        const maintDate = new Date(m.date);
        return maintDate >= monthAgo && maintDate <= today;
      });
    
    case 'yearly':
      const yearAgo = new Date(today.getFullYear(), 0, 1);
      return db.maintenance.filter(m => {
        const maintDate = new Date(m.date);
        return maintDate >= yearAgo && maintDate <= today;
      });
    
    default:
      return db.maintenance;
  }
}

function filterExpensesByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return db.expenses.filter(e => e.date === todayStr);
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return db.expenses.filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= monthAgo && expenseDate <= today;
      });
    
    case 'yearly':
      const yearAgo = new Date(today.getFullYear(), 0, 1);
      return db.expenses.filter(e => {
        const expenseDate = new Date(e.date);
        return expenseDate >= yearAgo && expenseDate <= today;
      });
    
    default:
      return db.expenses;
  }
}

// ===== فلترة المحاسبة حسب الفترة =====
function filterAccountingByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return {
        revenue: db.revenue.filter(r => r.date === todayStr),
        expenses: db.expenses.filter(e => e.date === todayStr)
      };
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        revenue: db.revenue.filter(r => {
          const revenueDate = new Date(r.date);
          return revenueDate >= monthAgo && revenueDate <= today;
        }),
        expenses: db.expenses.filter(e => {
          const expenseDate = new Date(e.date);
          return expenseDate >= monthAgo && expenseDate <= today;
        })
      };
    
    case 'yearly':
      const yearAgo = new Date(today.getFullYear(), 0, 1);
      return {
        revenue: db.revenue.filter(r => {
          const revenueDate = new Date(r.date);
          return revenueDate >= yearAgo && revenueDate <= today;
        }),
        expenses: db.expenses.filter(e => {
          const expenseDate = new Date(e.date);
          return expenseDate >= yearAgo && expenseDate <= today;
        })
      };
    
    default:
      return {
        revenue: db.revenue,
        expenses: db.expenses
      };
  }
}

// ===== فلترة الإيرادات حسب الفترة =====
function filterRevenueByPeriod(period) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  switch(period) {
    case 'daily':
      return db.revenue.filter(r => r.date === todayStr);
    
    case 'weekly':
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return db.revenue.filter(r => {
        const revenueDate = new Date(r.date);
        return revenueDate >= weekAgo && revenueDate <= today;
      });
    
    case 'monthly':
      const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);
      return db.revenue.filter(r => {
        const revenueDate = new Date(r.date);
        return revenueDate >= monthAgo && revenueDate <= today;
      });
    
    default:
      return db.revenue;
  }
}

// ===== تحديث ملخصات البيانات =====
function updateClientsSummary(clientsData) {
  const total = clientsData.length;
  const totalCars = clientsData.reduce((sum, c) => {
    return sum + db.cars.filter(car => car.clientId === c.id).length;
  }, 0);
  const avgCars = total > 0 ? totalCars / total : 0;
  
  $('#clientsTotal').textContent = total;
  $('#clientsCarsTotal').textContent = totalCars;
  $('#clientsAvgCars').textContent = fmt(avgCars);
}

function updateCarsSummary(carsData) {
  const total = carsData.length;
  const totalMaintenance = carsData.reduce((sum, c) => {
    return sum + db.maintenance.filter(m => m.carId === c.id).length;
  }, 0);
  const avgMaintenance = total > 0 ? totalMaintenance / total : 0;
  
  $('#carsTotal').textContent = total;
  $('#carsMaintenanceTotal').textContent = totalMaintenance;
  $('#carsAvgMaintenance').textContent = fmt(avgMaintenance);
}

function updateMaintenanceSummary(maintenanceData) {
  const total = maintenanceData.length;
  const uniqueTypes = new Set(maintenanceData.map(m => m.type)).size;
  const uniqueCars = new Set(maintenanceData.map(m => m.carId)).size;
  
  $('#maintenanceTotal').textContent = total;
  $('#maintenanceTypes').textContent = uniqueTypes;
  $('#maintenanceCars').textContent = uniqueCars;
}

function updateRevenueSummary(revenueData) {
  const total = revenueData.reduce((sum, r) => sum + (r.amount || 0), 0);
  const count = revenueData.length;
  const average = count > 0 ? total / count : 0;
  
  $('#revenueTotal').textContent = fmt(total);
  $('#revenueCount').textContent = count;
  $('#revenueAvg').textContent = fmt(average);
}

function updateExpensesSummary(expensesData) {
  const total = expensesData.reduce((sum, e) => sum + (e.amount || 0), 0);
  const count = expensesData.length;
  const average = count > 0 ? total / count : 0;
  
  $('#expensesTotal').textContent = fmt(total);
  $('#expensesCount').textContent = count;
  $('#expensesAvg').textContent = fmt(average);
}

function renderExpenses(){
  const tbody = $('#expBody');
  if(!tbody) return;
  
  let filteredExpenses = filterExpensesByPeriod(currentExpensesFilter);
  
  tbody.innerHTML = filteredExpenses.map((e,i) => {
    return `<tr><td>${i+1}</td><td>${fmt(e.amount)} ج.م</td><td>${e.date}</td><td>${e.type}</td><td>${e.notes || '-'}</td></tr>`;
  }).join('');
  
  // تحديث ملخص المصروفات
  updateExpensesSummary(filteredExpenses);
}

// ===== صفحة المحاسبة =====
function renderAccounting(){
  const filteredData = filterAccountingByPeriod(currentAccountingFilter);
  const totalRevenue = filteredData.revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalExpenses = filteredData.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  $('#totalRevenue').textContent = fmt(totalRevenue);
  $('#totalExpenses').textContent = fmt(totalExpenses);
  $('#netProfit').textContent = fmt(netProfit);

  // تحديث ألوان صافي الربح
  const netProfitEl = $('#netProfit');
  if (netProfit >= 0) {
    netProfitEl.style.color = 'var(--success)';
  } else {
    netProfitEl.style.color = 'var(--danger)';
  }
}

// ===== تصدير التقارير =====
function exportToCSV(data, filename) {
  if (!data || data.length === 0) {
    alert('⚠️ لا توجد بيانات للتصدير');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      // معالجة النصوص التي تحتوي على فواصل
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

$('#exportRevenue').onclick = () => {
  const filteredData = filterAccountingByPeriod(currentAccountingFilter);
  const revenueData = filteredData.revenue.map(r => {
    const client = db.clients.find(cl => cl.id === r.clientId);
    const car = db.cars.find(c => c.id === r.carId);
    return {
      'العميل': client?.name || 'غير محدد',
      'رقم السيارة': car?.plate || 'غير محدد',
      'المبلغ': r.amount,
      'التاريخ': r.date,
      'الوصف': r.desc || ''
    };
  });
  exportToCSV(revenueData, `تقرير_الأرباح_${getAccountingFilterTitle()}_${new Date().toISOString().slice(0,10)}.csv`);
};

$('#exportExpenses').onclick = () => {
  const filteredData = filterAccountingByPeriod(currentAccountingFilter);
  const expenseData = filteredData.expenses.map(e => ({
    'المبلغ': e.amount,
    'التاريخ': e.date,
    'النوع': e.type,
    'الملاحظات': e.notes || ''
  }));
  exportToCSV(expenseData, `تقرير_المصروفات_${getAccountingFilterTitle()}_${new Date().toISOString().slice(0,10)}.csv`);
};

$('#exportFullReport').onclick = () => {
  const filteredData = filterAccountingByPeriod(currentAccountingFilter);
  const fullReport = [];
  
  // إضافة ملخص
  const totalRevenue = filteredData.revenue.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalExpenses = filteredData.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  
  fullReport.push(
    { 'نوع البيانات': 'ملخص', 'التفاصيل': 'إجمالي الأرباح', 'القيمة': totalRevenue, 'التاريخ': '' },
    { 'نوع البيانات': 'ملخص', 'التفاصيل': 'إجمالي المصروفات', 'القيمة': totalExpenses, 'التاريخ': '' },
    { 'نوع البيانات': 'ملخص', 'التفاصيل': 'صافي الربح', 'القيمة': netProfit, 'التاريخ': '' },
    { 'نوع البيانات': '', 'التفاصيل': '', 'القيمة': '', 'التاريخ': '' }
  );

  // إضافة الإيرادات
  filteredData.revenue.forEach(r => {
    const client = db.clients.find(cl => cl.id === r.clientId);
    const car = db.cars.find(c => c.id === r.carId);
    fullReport.push({
      'نوع البيانات': 'إيراد',
      'التفاصيل': `${client?.name || 'غير محدد'} - ${car?.plate || 'غير محدد'}`,
      'القيمة': r.amount,
      'التاريخ': r.date
    });
  });

  // إضافة المصروفات
  filteredData.expenses.forEach(e => {
    fullReport.push({
      'نوع البيانات': 'مصروف',
      'التفاصيل': e.type,
      'القيمة': -e.amount,
      'التاريخ': e.date
    });
  });

  exportToCSV(fullReport, `تقرير_شامل_${getAccountingFilterTitle()}_${new Date().toISOString().slice(0,10)}.csv`);
};

// ===== تصدير بيانات العملاء الشاملة من صفحة المحاسبة =====
$('#exportClientsFullAccounting').onclick = () => {
  exportClientsFullData();
};

// ===== عرض تفاصيل السيارة =====
function showCarDetails(carId){
  const car = db.cars.find(c => c.id === carId);
  if(!car) return;
  
  const client = db.clients.find(cl => cl.id === car.clientId);
  const maintenance = db.maintenance.filter(m => m.carId === carId);
  
  $('#carDetailsTitle').textContent = `تفاصيل السيارة: ${car.plate}`;
  $('#carDetailsOwner').textContent = `المالك: ${client?.name || 'غير محدد'} | الموديل: ${car.model}`;
  
  $('#carDetailsTable').innerHTML = maintenance.map((m,i) => 
    `<tr><td>${i+1}</td><td>${m.date}</td><td>${m.type}</td><td>${m.notes || '-'}</td></tr>`
  ).join('');

  $('#carDetailsModal').classList.add('active');
}

// ===== إغلاق المودال =====
$$('[data-close]').forEach(btn => {
  btn.onclick = () => {
    const modalId = btn.dataset.close;
    $('#'+modalId).classList.remove('active');
  };
});

// ===== تصدير تفاصيل السيارة =====
$('#exportCarDetails').onclick = () => {
  const carId = parseInt($('#carDetailsTable').querySelector('tr')?.querySelector('td')?.textContent);
  if(!carId) return;
  
  const car = db.cars.find(c => c.id === carId);
  const client = db.clients.find(cl => cl.id === car.clientId);
  const maintenance = db.maintenance.filter(m => m.carId === carId);
  
  const carData = maintenance.map(m => ({
    'رقم السيارة': car.plate,
    'المالك': client?.name || 'غير محدد',
    'الموديل': car.model,
    'التاريخ': m.date,
    'نوع الصيانة': m.type,
    'الملاحظات': m.notes || ''
  }));
  
  exportToCSV(carData, `تفاصيل_السيارة_${car.plate}_${new Date().toISOString().slice(0,10)}.csv`);
};

// ===== تصدير بيانات العملاء الشاملة =====
$('#exportClientsFull').onclick = () => {
  exportClientsFullData();
};

function exportClientsFullData() {
  const clientsData = [];
  
  db.clients.forEach(client => {
    // الحصول على سيارات العميل
    const clientCars = db.cars.filter(car => car.clientId === client.id);
    
    if (clientCars.length === 0) {
      // إذا لم يكن لدى العميل سيارات، أضف صف واحد
      clientsData.push({
        'رقم العميل': client.id,
        'اسم العميل': client.name,
        'رقم الهاتف': client.phone,
        'رقم السيارة': '',
        'موديل السيارة': '',
        'نوع الصيانة': '',
        'تاريخ الصيانة': '',
        'ملاحظات الصيانة': '',
        'مبلغ الصيانة': '',
        'عدد السيارات': 0
      });
    } else {
      // لكل سيارة، أضف صف مع بيانات العميل
      clientCars.forEach(car => {
        const carMaintenance = db.maintenance.filter(m => m.carId === car.id);
        
        if (carMaintenance.length === 0) {
          // إذا لم تكن لدى السيارة صيانة، أضف صف واحد
          clientsData.push({
            'رقم العميل': client.id,
            'اسم العميل': client.name,
            'رقم الهاتف': client.phone,
            'رقم السيارة': car.plate,
            'موديل السيارة': car.model,
            'نوع الصيانة': '',
            'تاريخ الصيانة': '',
            'ملاحظات الصيانة': '',
            'مبلغ الصيانة': '',
            'عدد السيارات': clientCars.length
          });
        } else {
          // لكل صيانة، أضف صف منفصل
          carMaintenance.forEach(maint => {
            const revenue = db.revenue.find(r => r.carId === car.id && r.date === maint.date);
            clientsData.push({
              'رقم العميل': client.id,
              'اسم العميل': client.name,
              'رقم الهاتف': client.phone,
              'رقم السيارة': car.plate,
              'موديل السيارة': car.model,
              'نوع الصيانة': maint.type,
              'تاريخ الصيانة': maint.date,
              'ملاحظات الصيانة': maint.notes || '',
              'مبلغ الصيانة': revenue ? revenue.amount : '',
              'عدد السيارات': clientCars.length
            });
          });
        }
      });
    }
  });
  
  if (clientsData.length === 0) {
    alert('⚠️ لا توجد بيانات للتصدير');
    return;
  }
  
  // ترتيب البيانات حسب اسم العميل ثم تاريخ الصيانة
  clientsData.sort((a, b) => {
    if (a['اسم العميل'] !== b['اسم العميل']) {
      return a['اسم العميل'].localeCompare(b['اسم العميل'], 'ar');
    }
    if (a['تاريخ الصيانة'] && b['تاريخ الصيانة']) {
      return new Date(b['تاريخ الصيانة']) - new Date(a['تاريخ الصيانة']);
    }
    return 0;
  });
  
  exportToCSV(clientsData, `بيانات_العملاء_الشاملة_${new Date().toISOString().slice(0,10)}.csv`);
}

// ===== نسخ احتياطي / استعادة / ديمو =====
function download(name, text, type='application/json;charset=utf-8'){
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  URL.revokeObjectURL(url);
}
$('#backupJson').onclick = ()=> download('bateekhi_backup.json', JSON.stringify(db,null,2));
$('#restoreJson').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data || !Array.isArray(data.clients) || !Array.isArray(data.cars)) throw new Error('تنسيق غير صالح');
      db = data; saveDB(); refreshAll(); alert('✅ تم الاستيراد بنجاح');
    }catch(err){ alert('❌ فشل الاستيراد: '+err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});
$('#seedDemo').onclick = ()=>{
  if(!confirm('سيتم إضافة بيانات تجريبية. متابعة؟')) return;
  db = structuredClone(blank);
  db.clients = [
    {id:1,name:'أحمد علي',phone:'0100000001'},
    {id:2,name:'محمد سمير',phone:'0100000002'},
    {id:3,name:'شيماء عبد الله',phone:'0100000003'},
  ];
  db.cars = [
    {id:1,clientId:1,plate:'قنا 1234',model:'هيونداي i30'},
    {id:2,clientId:1,plate:'قنا 5678',model:'كيا سيراتو'},
    {id:3,clientId:2,plate:'قنا 2468',model:'تويوتا كورولا'},
  ];
  const t = todayStr();
  db.maintenance = [
    {id:1,carId:1,date:t,type:'فحص',notes:'فحص زوايا'},
    {id:2,carId:2,date:t,type:'تغيير قطع',notes:'مساعدين أمامي'},
  ];
  db.revenue = [
    {id:1,clientId:1,carId:1,amount:800,date:t,desc:'ضبط زوايا وتوازن'},
    {id:2,clientId:2,carId:3,amount:1200,date:t,desc:'تغيير تيل + خرط'},
  ];
  db.expenses = [
    {id:1,amount:300,date:t,type:'قطع غيار',notes:'تيل فرامل'},
    {id:2,amount:200,date:t,type:'أجور',notes:'يومية صنايعي'},
  ];
  saveDB(); refreshAll();
};

// ===== تحديث شامل =====
function refreshAll(){
  renderClients();
  renderCars();
  renderMaintenance();
  renderRevenue();
  renderExpenses();
  renderAccounting();
}

// ===== أول تحميل =====
refreshAll();

// ===== تفعيل البحث =====
enableSearch('#clientSearch','#clientsBody');
enableSearch('#carSearch','#carsBody');
enableSearch('#maintSearch','#maintBody');
enableSearch('#revSearch','#revBody');
enableSearch('#expSearch','#expBody');

// ===== أزرار فلترة الإيرادات =====
$('#filterDaily').onclick = () => {
  setRevenueFilter('daily');
};

$('#filterWeekly').onclick = () => {
  setRevenueFilter('weekly');
};

$('#filterMonthly').onclick = () => {
  setRevenueFilter('monthly');
};

function setRevenueFilter(filter) {
  currentRevenueFilter = filter;
  
  // تحديث حالة الأزرار
  $$('.filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض الإيرادات
  renderRevenue();
}

// ===== أزرار فلترة العملاء =====
$('#clientsFilterDaily').onclick = () => {
  setClientsFilter('daily');
};

$('#clientsFilterMonthly').onclick = () => {
  setClientsFilter('monthly');
};

$('#clientsFilterYearly').onclick = () => {
  setClientsFilter('yearly');
};

function setClientsFilter(filter) {
  currentClientsFilter = filter;
  
  // تحديث حالة الأزرار
  $$('#clients .filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#clientsFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض العملاء
  renderClients();
}

// ===== أزرار فلترة السيارات =====
$('#carsFilterDaily').onclick = () => {
  setCarsFilter('daily');
};

$('#carsFilterMonthly').onclick = () => {
  setCarsFilter('monthly');
};

$('#carsFilterYearly').onclick = () => {
  setCarsFilter('yearly');
};

function setCarsFilter(filter) {
  currentCarsFilter = filter;
  
  // تحديث حالة الأزرار
  $$('#cars .filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#carsFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض السيارات
  renderCars();
}

// ===== أزرار فلترة الصيانة =====
$('#maintenanceFilterDaily').onclick = () => {
  setMaintenanceFilter('daily');
};

$('#maintenanceFilterMonthly').onclick = () => {
  setMaintenanceFilter('monthly');
};

$('#maintenanceFilterYearly').onclick = () => {
  setMaintenanceFilter('yearly');
};

function setMaintenanceFilter(filter) {
  currentMaintenanceFilter = filter;
  
  // تحديث حالة الأزرار
  $$('#maintenance .filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#maintenanceFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض الصيانة
  renderMaintenance();
}

// ===== أزرار فلترة المصروفات =====
$('#expensesFilterDaily').onclick = () => {
  setExpensesFilter('daily');
};

$('#expensesFilterMonthly').onclick = () => {
  setExpensesFilter('monthly');
};

$('#expensesFilterYearly').onclick = () => {
  setExpensesFilter('yearly');
};

function setExpensesFilter(filter) {
  currentExpensesFilter = filter;
  
  // تحديث حالة الأزرار
  $$('#expenses .filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#expensesFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض المصروفات
  renderExpenses();
}

// ===== أزرار فلترة المحاسبة =====
$('#accountingFilterDaily').onclick = () => {
  setAccountingFilter('daily');
};

$('#accountingFilterMonthly').onclick = () => {
  setAccountingFilter('monthly');
};

$('#accountingFilterYearly').onclick = () => {
  setAccountingFilter('yearly');
};

function setAccountingFilter(filter) {
  currentAccountingFilter = filter;
  
  // تحديث حالة الأزرار
  $$('#accounting .filter-buttons .btn').forEach(btn => btn.classList.remove('active'));
  $(`#accountingFilter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');
  
  // إعادة عرض المحاسبة
  renderAccounting();
}

// ===== تصدير الإيرادات =====
$('#exportRevenueExcel').onclick = () => {
  exportRevenueToExcel();
};

$('#exportRevenueCSV').onclick = () => {
  exportRevenueToCSV();
};

// ===== تصدير إلى Excel (HTML Table) =====
function exportRevenueToExcel() {
  const filteredRevenue = filterRevenueByPeriod(currentRevenueFilter);
  
  if (filteredRevenue.length === 0) {
    alert('⚠️ لا توجد بيانات للتصدير');
    return;
  }
  
  // إنشاء جدول HTML
  let htmlTable = `
    <table border="1">
      <thead>
        <tr>
          <th>#</th>
          <th>العميل</th>
          <th>رقم السيارة</th>
          <th>المبلغ</th>
          <th>التاريخ</th>
          <th>الوصف</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  filteredRevenue.forEach((r, i) => {
    const client = db.clients.find(cl => cl.id === r.clientId);
    const car = db.cars.find(c => c.id === r.carId);
    htmlTable += `
      <tr>
        <td>${i + 1}</td>
        <td>${client?.name || 'غير محدد'}</td>
        <td>${car?.plate || 'غير محدد'}</td>
        <td>${r.amount}</td>
        <td>${r.date}</td>
        <td>${r.desc || ''}</td>
      </tr>
    `;
  });
  
  htmlTable += '</tbody></table>';
  
  // إنشاء ملف HTML يمكن فتحه في Excel
  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير الإيرادات - ${getFilterTitle()}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .header { text-align: center; margin: 20px 0; font-size: 18px; font-weight: bold; }
        .summary { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">تقرير الإيرادات - ${getFilterTitle()}</div>
      <div class="summary">
        <strong>إجمالي الإيرادات:</strong> ${fmt(filteredRevenue.reduce((sum, r) => sum + (r.amount || 0), 0))} ج.م<br>
        <strong>عدد العمليات:</strong> ${filteredRevenue.length}<br>
        <strong>متوسط الإيراد:</strong> ${fmt(filteredRevenue.length > 0 ? filteredRevenue.reduce((sum, r) => sum + (r.amount || 0), 0) / filteredRevenue.length : 0)} ج.م
      </div>
      ${htmlTable}
    </body>
    </html>
  `;
  
  // تحميل الملف
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `تقرير_الإيرادات_${getFilterTitle()}_${new Date().toISOString().slice(0,10)}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

// ===== تصدير إلى CSV =====
function exportRevenueToCSV() {
  const filteredRevenue = filterRevenueByPeriod(currentRevenueFilter);
  
  if (filteredRevenue.length === 0) {
    alert('⚠️ لا توجد بيانات للتصدير');
    return;
  }
  
  const revenueData = filteredRevenue.map(r => {
    const client = db.clients.find(cl => cl.id === r.clientId);
    const car = db.cars.find(c => c.id === r.carId);
    return {
      'العميل': client?.name || 'غير محدد',
      'رقم السيارة': car?.plate || 'غير محدد',
      'المبلغ': r.amount,
      'التاريخ': r.date,
      'الوصف': r.desc || ''
    };
  });
  
  exportToCSV(revenueData, `تقرير_الإيرادات_${getFilterTitle()}_${new Date().toISOString().slice(0,10)}.csv`);
}

// ===== الحصول على عنوان الفلتر =====
function getFilterTitle() {
  switch(currentRevenueFilter) {
    case 'daily': return 'يومي';
    case 'weekly': return 'أسبوعي';
    case 'monthly': return 'شهري';
    default: return 'كلي';
  }
}

// ===== الحصول على عنوان فلتر المحاسبة =====
function getAccountingFilterTitle() {
  switch(currentAccountingFilter) {
    case 'daily': return 'يومي';
    case 'monthly': return 'شهري';
    case 'yearly': return 'سنوي';
    default: return 'كلي';
  }
}
