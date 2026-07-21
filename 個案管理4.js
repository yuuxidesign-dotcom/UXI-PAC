
// ── 角色設定 ──
const ROLES = {
  mgr:{name:'林美惠',label:'個案管理師',av:'av-mgr',ch:'林'},
  doc:{name:'張宗達',label:'醫師',av:'av-doc',ch:'張'},
  nur:{name:'陳玉玲',label:'護理師',av:'av-nur',ch:'陳'},
  adm:{name:'蔡書明',label:'行政',av:'av-adm',ch:'蔡'},
};
// 個管師假資料清單（新增個案表單「負責個管師」下拉選單用，非登入角色切換）
const CASE_MANAGERS=['林美惠','陳淑芬','黃國華'];
// PAC 收案判斷「判斷者」下拉選單假資料（醫師＋個管師皆可能為判斷者）
const JUDGE_PERSONS=['張宗達 醫師','李文彬 醫師',...CASE_MANAGERS.map(m=>`${m} 個管師`)];
let currentRole='mgr';
let currentPage='list';
let currentCase=null;
let currentForm=null;
let roleFilterStatus=null; // 醫師／護理師視角的狀態篩選（預設進入時鎖定「收案判斷中」，可自行切換查閱其他狀態）
let docHomeReportFilterActive=false; // 醫師視角：是否鎖定只看「居家訪視/院內診察待回報」個案（與 roleFilterStatus 互斥）
let summaryEditMode=false; // 病摘卡片（住院診斷／出院診斷／病史）是否處於編輯狀態，僅臨時病歷階段個管師可切換
let summaryEditCaseId=null; // 記錄目前編輯狀態對應的個案 id，切換個案時自動重置編輯狀態
let detailActiveTab='overview'; // 個案詳情頁目前開啟的 Tab，預設「總覽」
let detailActiveTabCaseId=null; // 記錄目前 Tab 狀態對應的個案 id，切換個案時自動重置為「總覽」
let rehabWeekIndex=1; // 居家復健排班目前檢視的週次（1-based）
let rehabWeekCaseId=null; // 記錄目前週次對應的個案 id，切換個案時自動重置為第1週
let bedAssignFormOpen=false; // 住院／臨時病歷階段「登記已排床」表單是否展開
let bedAssignFormCaseId=null; // 記錄目前展開表單對應的個案 id，切換個案時自動重置為收合

// ── 疾病別定義 ──
// PAC 四大疾病別（依員郭醫院實際收案範圍）
const PAC_DISEASE_TYPES=['腦中風','創傷性神經損傷','脆弱性骨折','衰弱高齡'];
// 一般（非PAC）住院常見分類，含「其他」開放手動輸入
const GENERAL_DISEASE_TYPES=['外科開刀（甲狀腺/脊椎/神經外科等）','一般復健（中風/脊椎損傷，非PAC專案）','安寧住院','內科住院（家醫科）','其他'];
// PAC 收案條件對照表：用於開案日/結案日自動推算（取週數下限）
const PAC_CARE_PERIOD={
  '腦中風':{minAge:0,weeksMin:6,weeksMax:12},
  '創傷性神經損傷':{minAge:18,weeksMin:6,weeksMax:12},
  '脆弱性骨折':{minAge:18,weeksMin:2,weeksMax:3},
  '衰弱高齡':{minAge:75,weeksMin:3,weeksMax:4},
};
function calcAge(birthDateStr){
  // 簡化版年齡計算，prototype 示意用，輸入格式 yyyy/mm/dd 或 yyyy-mm-dd
  const today=new Date('2026-06-30');
  const d=new Date(birthDateStr.replace(/\//g,'-'));
  let age=today.getFullYear()-d.getFullYear();
  const m=today.getMonth()-d.getMonth();
  if(m<0||(m===0&&today.getDate()<d.getDate())) age--;
  return age;
}
// 居家個案是否仍在等待醫師完成到宅評估「回報」：居家模式・時間軸子階段為「待醫師評估」・醫師尚未回報結果（接收與回報已合併為單一狀態）
function isPendingHomeDoctorReport(c){
  return c.modeType==='home'&&c.timelineSub==='待醫師評估'&&!c.doctorReport;
}
function calcCloseDate(openDateStr,disease){
  // 依疾病別取週數下限，預設值，個管師可手動調整
  const period=PAC_CARE_PERIOD[disease];
  if(!period) return '—';
  const d=new Date(openDateStr.replace(/\//g,'-'));
  d.setDate(d.getDate()+period.weeksMin*7);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ── 個案列表排序（依 listSortOrder，作用於目前篩選後的個案列表）──
function parseDateStr(str){
  if(!str||str==='—') return null;
  const t=new Date(str.replace(/\//g,'-')).getTime();
  return isNaN(t)?null:t;
}
function sortCases(arr){
  const sorted=[...arr];
  if(listSortOrder==='dateDesc'){
    sorted.sort((a,b)=>(parseDateStr(b.date)||0)-(parseDateStr(a.date)||0));
  } else if(listSortOrder==='dateAsc'){
    sorted.sort((a,b)=>(parseDateStr(a.date)||0)-(parseDateStr(b.date)||0));
  } else if(listSortOrder==='nameAsc'){
    sorted.sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  } else if(listSortOrder==='closeDateAsc'){
    sorted.sort((a,b)=>{
      const ad=parseDateStr(a.closeDate);
      const bd=parseDateStr(b.closeDate);
      if(ad===null&&bd===null) return 0;
      if(ad===null) return 1; // 臨時病歷（無預估出院日期）排在最後
      if(bd===null) return -1;
      return ad-bd;
    });
  }
  return sorted;
}

// ── 個案資料 ──
// 精簡狀態（11組）：收案判斷中／待補件／確認收案／待排床／待聯絡／待開案／待評估／照護中／展延中／即將結案／封存
// 結案（成功/失敗）不再是獨立狀態，一律經由封存 Modal 直接轉為「封存」，類型記錄於 archiveType（正常結案／結案失敗）
// （移除「新轉介」：新增個案時即決定收案判斷中 or 待補件，無需中間暫存狀態）
// timelineStep：目前停在哪個時間軸節點（時間軸保留「新轉介」作為歷史事件節點）
// archiveType：封存類型（僅封存狀態使用，詳情頁漸進式揭露）
// birthDate：出生日期，用於即時換算年齡；upstreamContact：上游聯絡人資訊；familyRelation：家屬關係
// roomPref：房型偏好（null=無偏好，'single'=單人房，'double'=雙人房，'multi'=多人房）
const CASES={
  temp:[
    {id:'t1',name:'李志明',birthDate:'1940/03/12',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/24',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',upstreamStatus:'尚未回報',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',roomPref:'single',address:'彰化縣彰化市中山路一段100號',admissionDiagnosis:'Acute right MCA infarction with left hemiparesis',dischargeDiagnosis:'Right MCA infarction, post-thrombolysis, neurologically stable, left hemiparesis improving',medicalHistory:'高血壓病史15年、糖尿病史8年，規則服藥控制中',referralDoc:{name:'轉診單.pdf',size:'1.1 MB',date:'2026/06/24'}},
    {id:'t2',name:'黃秋香',birthDate:'1948/11/02',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'彰化秀傳',date:'2026/06/22',status:'待補件',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待補件',upstreamStatus:'尚未回報',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'女兒',roomPref:null,address:'彰化縣員林市中正路200號',admissionDiagnosis:'Closed fracture, right femoral neck, s/p fall',dischargeDiagnosis:'S/p right hip hemiarthroplasty, fracture healing well, weight-bearing as tolerated',medicalHistory:'骨質疏鬆症病史，未規則服藥'},
    {id:'t3',name:'吳金水',birthDate:'1945/07/20',mode:'日照',modeType:'day',disease:'腦中風',source:'台中榮總',date:'2026/06/20',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',timelineSub:'醫師／護理師收案判斷',upstreamStatus:'尚未回報',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'配偶',roomPref:null,address:'彰化縣鹿港鎮中山路50號',admissionDiagnosis:'Acute lacunar infarction, right basal ganglia, with mild left-sided weakness',dischargeDiagnosis:'Lacunar infarct, right basal ganglia, stable, mild residual left hemiparesis',medicalHistory:'高血壓病史10年，未規則服藥'},
    {id:'t4',name:'鄭文雄',birthDate:'1952/01/15',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'門診自轉',date:'2026/06/18',status:'待排床',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待排床',upstreamStatus:'已回報收案',upstreamContact:{name:'—',phone:'—',line:'—'},familyRelation:'兒子',roomPref:'double',address:'彰化縣和美鎮和平路88號',admissionDiagnosis:'Closed fracture, left intertrochanteric femur, s/p fall',dischargeDiagnosis:'S/p left proximal femoral nailing, fracture stable, partial weight-bearing',medicalHistory:'高血壓病史9年、骨質疏鬆症病史',nurseNotified:true},
    {id:'t5',name:'許美雲',birthDate:'1943/09/08',mode:'居家',modeType:'home',disease:'腦中風',source:'彰基醫院',date:'2026/06/19',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待醫師評估',rehabReport:'可承接',doctorReport:'pac',upstreamStatus:'已回報收案',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'女兒',roomPref:null,address:'彰化縣北斗鎮中華路15號',admissionDiagnosis:'Acute left PCA territory infarction with right visual field deficit',dischargeDiagnosis:'Left PCA infarction, stable, residual right homonymous hemianopia',medicalHistory:'心房顫動病史5年，服用抗凝血劑'},
    {id:'t6',name:'周大為',birthDate:'1947/04/30',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/15',status:'待聯絡',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待聯絡',upstreamStatus:'已回報收案',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',roomPref:'multi',address:'彰化縣溪湖鎮西環路66號',admissionDiagnosis:'Acute right MCA infarction with left hemiparesis and dysarthria',dischargeDiagnosis:'Right MCA infarction, post-thrombectomy, stable, dysarthria improving',medicalHistory:'高血壓病史12年、高血脂病史6年',nurseNotified:true},
    // 居家臨時病歷示範：醫師居家評估已回報「不符合 PAC 資格」情境
    {id:'t10',name:'蔡秀琴',birthDate:'1946/02/14',mode:'居家',modeType:'home',disease:'腦中風',source:'彰基醫院',date:'2026/06/23',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待醫師評估',rehabReport:'可承接',doctorReport:'nonpac',upstreamStatus:'已回報收案',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'兒子',roomPref:null,address:'彰化縣溪湖鎮成功路8號',admissionDiagnosis:'Suspected mild lacunar infarction, symptoms largely resolved prior to referral',dischargeDiagnosis:'—',medicalHistory:'高血壓病史，輕度認知障礙病史；醫師居家評估後研判症狀已顯著恢復，不符合PAC收案條件'},
    // 居家臨時病歷示範：已轉交醫師居家評估，醫師尚未回報結果（待居家到宅評估回報）
    {id:'t11',name:'邱麗雲',birthDate:'1949/10/30',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'台中榮總',date:'2026/06/25',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待醫師評估',rehabReport:'可承接',upstreamStatus:'已回報收案',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'女兒',roomPref:null,address:'彰化縣田中鎮中州路45號',admissionDiagnosis:'Closed fracture, left distal radius, s/p fall at home',dischargeDiagnosis:'S/p closed reduction and casting, left distal radius fracture, stable alignment',medicalHistory:'骨質疏鬆症病史、退化性關節炎'},
    // 居家臨時病歷示範：醫師已接收訪視安排，尚未回報結果（待居家到宅評估回報）
    {id:'t15',name:'廖美惠',birthDate:'1945/12/03',mode:'居家',modeType:'home',disease:'腦中風',source:'台中榮總',date:'2026/06/28',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待醫師評估',rehabReport:'可承接',upstreamStatus:'已回報收案',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'兒子',roomPref:null,address:'彰化縣二水鄉光復路6號',admissionDiagnosis:'Acute right MCA infarction with mild left hemiparesis',dischargeDiagnosis:'Right MCA infarction, stable, mild left-sided weakness improving',medicalHistory:'高血壓病史9年、糖尿病史3年'},
    // 居家臨時病歷示範：步驟①已交付，復健主管已回覆「可承接」，個管師尚未點擊確認復健受理（時間軸仍在「待復健評估」）
    {id:'t12',name:'許阿蘭',birthDate:'1944/08/17',mode:'居家',modeType:'home',disease:'腦中風',source:'臺大醫院',date:'2026/06/26',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待復健評估',rehabReport:'可承接',upstreamStatus:'已回報收案',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',roomPref:null,address:'彰化縣秀水鄉安東路22號',admissionDiagnosis:'Acute right MCA infarction with mild left-sided weakness',dischargeDiagnosis:'Right MCA infarction, stable, mild left hemiparesis, ambulatory',medicalHistory:'高血壓病史14年'},
    // 居家臨時病歷示範：步驟①已交付，復健主管已回覆「無法承接（量能不足）」，個管師尚未點擊封存
    {id:'t13',name:'江秀蓮',birthDate:'1950/05/09',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'彰化秀傳',date:'2026/06/27',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待復健評估',rehabReport:'無法承接',upstreamStatus:'已回報收案',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'女兒',roomPref:null,address:'彰化縣員林市三民街11號',admissionDiagnosis:'Closed fracture, right femoral neck, s/p fall at home',dischargeDiagnosis:'S/p right hip hemiarthroplasty, fracture healing well',medicalHistory:'骨質疏鬆症病史、慢性腎臟病第二期'},
    {id:'t7',name:'蔡素珍',birthDate:'1950/12/25',mode:'日照',modeType:'day',disease:'脆弱性骨折',source:'台中榮總',date:'2026/06/12',status:'待開案',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待開案',upstreamStatus:'已回報收案',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'媳婦',roomPref:null,address:'彰化縣田中鎮中州路120號',admissionDiagnosis:'Closed fracture, right distal radius, s/p fall',dischargeDiagnosis:'S/p closed reduction and casting, right distal radius fracture, stable alignment',medicalHistory:'骨質疏鬆症病史、輕度失智症'},
    {id:'t8',name:'謝國雄',birthDate:'1944/06/17',mode:'住院',modeType:'hosp',disease:'腦中風',source:'彰基醫院',date:'2026/06/08',status:'封存',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:null,archiveType:'住院當日未報到',archiveDate:'2026/06/09',archiveOperator:'林美惠',archiveReason:'個案確認入院當日聯繫家屬後表示暫不入院，需重新評估時機。',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'配偶',roomPref:null,address:'彰化縣二林鎮斗苑路300號',admissionDiagnosis:'Acute left MCA infarction with right hemiparesis and expressive aphasia',dischargeDiagnosis:'Left MCA infarction, stable, residual expressive aphasia',medicalHistory:'糖尿病史10年、慢性腎臟病第三期'},
    // 封存個案：與「杏翔匯入」Tab 範例查詢結果（姓名王建民、出生日期 1952/08/20）同名同生日，用於示範新增個案時的封存資料比對命中情境
    {id:'t9',name:'王建民',birthDate:'1952/08/20',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'門診自轉',date:'2025/11/02',status:'封存',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:null,archiveType:'資料輸入錯誤',archiveDate:'2025/11/05',archiveOperator:'林美惠',archiveReason:'個案身分證字號登打錯誤，原個案資料作廢，需重新建立正確個案。',upstreamContact:{name:'—',phone:'—',line:'—'},familyRelation:'兒子',roomPref:null,address:'彰化縣員林市光明街20號',admissionDiagnosis:'Closed fracture, right distal radius, s/p fall',dischargeDiagnosis:'S/p closed reduction and casting, right distal radius fracture, stable alignment',medicalHistory:'高血壓病史6年'},
    // 測試個案：住院／腦中風，收案判斷中初始狀態
    {id:'t16',name:'住院測試',birthDate:'1955/09/10',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/25',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',upstreamStatus:'尚未回報',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',familyPhone:'0921-345-678',roomPref:'single',address:'彰化縣員林市中山路二段20號',admissionDiagnosis:'Acute right MCA territory infarction with left hemiparesis and dysarthria',dischargeDiagnosis:'Right MCA infarction, post-thrombolysis, neurologically stable, ambulatory with assistance',medicalHistory:'高血壓病史12年、心房顫動病史4年，規則服藥控制中',referralDoc:{name:'轉診單.pdf',size:'1.0 MB',date:'2026/06/25'}},
    // 測試個案：日照／脆弱性骨折，收案判斷中初始狀態
    {id:'t17',name:'日照測試',birthDate:'1957/11/20',mode:'日照',modeType:'day',disease:'脆弱性骨折',source:'彰化基督教醫院',date:'2026/06/25',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',upstreamStatus:'尚未回報',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'女兒',familyPhone:'0933-123-456',roomPref:null,address:'彰化縣鹿港鎮中山路80號',admissionDiagnosis:'Closed fracture, right distal radius, s/p fall at home',dischargeDiagnosis:'S/p closed reduction and casting, right distal radius fracture, stable alignment',medicalHistory:'骨質疏鬆症病史、退化性關節炎病史，長期服用鈣片補充劑',referralDoc:{name:'轉診單.pdf',size:'0.9 MB',date:'2026/06/25'}},
    // 測試個案：居家／衰弱高齡，收案判斷中初始狀態
    {id:'t18',name:'居家測試',birthDate:'1950/08/15',mode:'居家',modeType:'home',disease:'衰弱高齡',source:'彰化秀傳醫院',date:'2026/06/25',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',upstreamStatus:'尚未回報',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'配偶',familyPhone:'0987-654-321',roomPref:null,address:'彰化縣田尾鄉民族路15號',admissionDiagnosis:'General frailty syndrome with recurrent falls and progressive decline in mobility',dischargeDiagnosis:'Frailty syndrome, stable, discharged home with PAC rehabilitation plan',medicalHistory:'高血壓病史20年、輕度肌少症，近半年跌倒2次病史',referralDoc:{name:'轉診單.pdf',size:'1.1 MB',date:'2026/06/25'},homeRehabSchedule:[
      {dow:0,period:'午休',timeRange:'約 12:00-13:30',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:null},
      {dow:1,period:'晚上',timeRange:'約 18:00-20:00',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:2,period:'午休',timeRange:'約 12:00-13:30',profession:'ST',therapist:'林雅芳',duration:'40分鐘',tag:null},
      {dow:3,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'黃志豪',duration:'40分鐘',tag:null},
      {dow:5,period:'午休',timeRange:'約 12:00-13:30',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:6,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:null},
    ]},
  ],
  formal:[
    {id:'f1',name:'陳建國',birthDate:'1954/02/10',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/10',status:'展延中',mgr:'林美惠',formal:true,countdown:2,week:2,timelineStep:'展延中',timelineSub:'待展延申請',referral:{status:'待轉介',note:''},upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',openDate:'2026/06/10',closeDate:'2026/07/22',roomPref:'double',address:'彰化縣社頭鄉中山路33號',department:'神經內科',admissionDiagnosis:'Acute left MCA territory infarction with right hemiparesis and aphasia',dischargeDiagnosis:'Left MCA infarction, post-thrombolysis, neurologically stable for PAC rehabilitation',medicalHistory:'高血壓病史10年、第二型糖尿病病史5年',referralDoc:{name:'轉診單.pdf',size:'1.1 MB',date:'2026/06/10'}},
    {id:'f2',name:'王淑芬',birthDate:'1958/08/03',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'彰基醫院',date:'2026/05/28',status:'展延中',mgr:'林美惠',formal:true,countdown:3,week:4,timelineStep:'展延中',timelineSub:'審核中',referral:{status:'待轉介',note:''},upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'女兒',openDate:'2026/05/28',closeDate:'2026/06/11',roomPref:null,address:'彰化縣永靖鄉中山路77號',department:'骨科',admissionDiagnosis:'Closed fracture, left femoral neck, s/p fall',dischargeDiagnosis:'S/p left hip hemiarthroplasty, fracture healing well, ambulatory with walker',medicalHistory:'骨質疏鬆症病史，服用抗骨鬆藥物'},
    {id:'f3',name:'劉家豪',birthDate:'1949/05/22',mode:'居家',modeType:'home',disease:'腦中風',source:'台中榮總',date:'2026/06/05',status:'照護中',mgr:'林美惠',formal:true,countdown:null,week:3,timelineStep:'照護中',referral:{status:'待轉介',note:''},upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'兒子',openDate:'2026/06/05',closeDate:'2026/07/17',roomPref:null,address:'彰化縣埔心鄉義民路22號',department:'神經內科',admissionDiagnosis:'Acute right MCA infarction with left hemiparesis',dischargeDiagnosis:'Right MCA infarction, stable, left hemiparesis, ambulatory with assistance',medicalHistory:'高血壓病史8年，無其他重大病史',homeRehabSchedule:[
      {dow:0,period:'午休',timeRange:'約 12:00-13:30',profession:'PT',therapist:'黃志豪',duration:'40分鐘',tag:null},
      {dow:1,period:'晚上',timeRange:'約 18:00-20:00',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:2,period:'午休',timeRange:'約 12:00-13:30',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:'複評'},
      {dow:3,period:'晚上',timeRange:'約 18:00-20:00',profession:'ST',therapist:'林雅芳',duration:'40分鐘',tag:null},
      {dow:5,period:'午休',timeRange:'約 12:00-13:30',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:6,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'黃志豪',duration:'40分鐘',tag:null},
    ]},
    {id:'f4',name:'林翠娟',birthDate:'1946/10/11',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'台中榮總',date:'2026/04/15',status:'即將結案',mgr:'林美惠',formal:true,countdown:null,week:11,timelineStep:'即將結案',referral:{status:'待轉介',note:''},upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'配偶',openDate:'2026/04/15',closeDate:'2026/04/29',roomPref:'single',address:'彰化縣溪州鄉中央路45號',department:'骨科',admissionDiagnosis:'Closed fracture, right intertrochanteric femur, s/p fall',dischargeDiagnosis:'S/p right proximal femoral nailing, fracture stable, weight-bearing as tolerated',medicalHistory:'骨質疏鬆症病史、高血壓病史7年',dischargeDest:'返家＋居家照護服務'},
    {id:'f5',name:'張明輝',birthDate:'1951/03/28',mode:'日照',modeType:'day',disease:'腦中風',source:'臺大醫院',date:'2026/05/01',status:'即將結案',mgr:'林美惠',formal:true,countdown:null,week:10,timelineStep:'即將結案',referral:{status:'轉介中',note:'轉介長照服務，已聯繫長照管理中心'},upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',openDate:'2026/05/01',closeDate:'2026/06/12',roomPref:null,address:'彰化縣大村鄉村上路18號',department:'神經內科',admissionDiagnosis:'Acute left basal ganglia hemorrhage with right hemiparesis',dischargeDiagnosis:'Left basal ganglia ICH, stable post-conservative management, right hemiparesis improving',medicalHistory:'高血壓病史20年、心房顫動病史3年',dischargeDest:'轉長照機構'},
    {id:'f6',name:'吳建宏',birthDate:'1948/12/05',mode:'居家',modeType:'home',disease:'腦中風',source:'彰基醫院',date:'2026/03/01',status:'照護中',mgr:'林美惠',formal:true,countdown:null,week:7,timelineStep:'照護中',timelineSub:'展延後',hadExtensionFail:true,referral:{status:'待轉介',note:''},upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'兒子',openDate:'2026/03/01',closeDate:'2026/05/24',roomPref:null,address:'彰化縣埔鹽鄉南新路9號',department:'神經內科',admissionDiagnosis:'Acute right MCA infarction with left hemiparesis and dysphagia',dischargeDiagnosis:'Right MCA infarction, stable, dysphagia improved, NG tube removed',medicalHistory:'糖尿病史15年、高血壓病史10年',homeRehabSchedule:[
      {dow:0,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'黃志豪',duration:'40分鐘',tag:null},
      {dow:1,period:'午休',timeRange:'約 12:00-13:30',profession:'ST',therapist:'林雅芳',duration:'40分鐘',tag:null},
      {dow:2,period:'晚上',timeRange:'約 18:00-20:00',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:3,period:'午休',timeRange:'約 12:00-13:30',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:null},
      {dow:5,period:'晚上',timeRange:'約 18:00-20:00',profession:'ST',therapist:'林雅芳',duration:'40分鐘',tag:'結案評估'},
      {dow:6,period:'午休',timeRange:'約 12:00-13:30',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
    ]},
    {id:'f7',name:'王秀美',birthDate:'1942/09/14',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/02/01',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:12,timelineStep:null,archiveType:'正常結案',archiveDate:'2026/04/26',archiveOperator:'林美惠',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'女兒',openDate:'2026/02/01',closeDate:'2026/04/26',roomPref:'double',address:'彰化縣秀水鄉安東路60號',department:'神經內科',admissionDiagnosis:'Acute left MCA infarction with right hemiparesis',dischargeDiagnosis:'Left MCA infarction, stable, ambulatory with quad cane, discharged home',medicalHistory:'高血壓病史18年、陳舊性腦梗塞病史'},
    {id:'f8',name:'郭志強',birthDate:'1956/04/27',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'彰化秀傳',date:'2026/01/10',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:null,timelineStep:null,archiveType:'結案失敗',archiveDate:'2026/03/15',archiveOperator:'林美惠',archiveReason:'個案病況變化，需轉回急性醫院持續治療，無法繼續 PAC 療程。',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'兒子',openDate:'2026/01/10',closeDate:'2026/01/24',roomPref:null,address:'彰化縣花壇鄉中山路150號',department:'骨科',admissionDiagnosis:'Closed fracture, left femoral neck, s/p fall at home',dischargeDiagnosis:'S/p left hip hemiarthroplasty, fracture healing well, discharged for home PAC rehabilitation',medicalHistory:'骨質疏鬆症病史、退化性關節炎',referral:{status:'已轉介',note:'已轉介居家醫療團隊接續照護，聯絡窗口：陳個管師 04-XXXX-XXXX。'},homeRehabSchedule:[
      {dow:0,period:'午休',timeRange:'約 12:00-13:30',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:'初評'},
      {dow:1,period:'晚上',timeRange:'約 18:00-20:00',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:2,period:'午休',timeRange:'約 12:00-13:30',profession:'ST',therapist:'林雅芳',duration:'40分鐘',tag:null},
      {dow:3,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'黃志豪',duration:'40分鐘',tag:null},
      {dow:5,period:'午休',timeRange:'約 12:00-13:30',profession:'OT',therapist:'李佳穎',duration:'40分鐘',tag:null},
      {dow:6,period:'晚上',timeRange:'約 18:00-20:00',profession:'PT',therapist:'陳建成',duration:'40分鐘',tag:null},
    ]},
    // 封存：正式病歷非PAC個案（PAC判斷後確認為非PAC，移交病床管理並封存於此模組）
    {id:'f9',name:'陳淑真',birthDate:'1955/07/19',mode:'一般',modeType:'general',disease:'一般復健（中風/脊椎損傷，非PAC專案）',source:'門診',date:'2026/06/01',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:null,timelineStep:null,archiveType:'非PAC個案',archiveDate:'2026/06/03',archiveOperator:'林美惠',archiveReason:'收案判斷確認為非PAC個案，個案資料已移交病床管理模組統一管轄。',upstreamContact:{name:'—',phone:'—',line:'—'},familyRelation:'女兒',openDate:'2026/06/01',closeDate:'—',roomPref:null,address:'彰化縣芬園鄉彰南路5號',department:'復健科',admissionDiagnosis:'Post-surgical status, lumbar spine decompression, non-PAC rehabilitation',dischargeDiagnosis:'S/p lumbar spine surgery, stable, general rehabilitation continuing',medicalHistory:'退化性脊椎病史多年，長期下背痛'},
  ]
};

// ── 常用上游聯絡人清單（新增個案時可快速選取帶入）──
const FREQUENT_UPSTREAM_CONTACTS=[
  {name:'李護理師',hospital:'臺大醫院',phone:'02-1234-5678',line:'taida_li'},
  {name:'劉個管師',hospital:'彰基醫院',phone:'04-4444-5555',line:'cb_liu'},
  {name:'陳出院準備護理師',hospital:'台中榮總',phone:'04-3333-4444',line:'tc_chen'},
  {name:'王個管師',hospital:'彰化秀傳',phone:'04-2222-3333',line:'cy_wang'},
];

// ── 行政視角：待建檔通知（假資料）── 個管師已按下「轉成正式病歷」但行政尚未輸入病歷號的個案
let PENDING_RECORDS=[
  {id:'pr1',name:'陳志明',age:68,mode:'住院PAC',disease:'腦中風',mgr:'林美惠',convertedAt:'2026/06/25 09:30'},
];

// ── 通知鈴鐺（假資料）── 行政完成建檔後通知負責個管師
const NOTIFICATIONS=[
  {id:1,text:'陳志明 已成功轉為正式病歷，病歷號：00073450（行政 蔡書明 建檔，2026/06/25 14:20）',read:false},
  {id:2,text:'王淑芬 已成功轉為正式病歷，病歷號：00073521（行政 蔡書明 建檔，2026/06/24 11:05）',read:false},
];
let notifDropdownOpen=false;

// ── 預估出院動向選項（正式病歷個案基本資料／成功結案・不成功結案 Modal 共用）──
const DISCHARGE_DEST_OPTIONS=['','返家','返家＋居家照護服務','轉長照機構','轉其他醫院','死亡','其他'];

// ── 13組精簡狀態的 badge 顏色 ──
const STATUS_COLOR={
  '收案判斷中':'badge-amber',
  '待補件':'badge-amber',
  '確認收案':'badge-purple',
  '待排床':'badge-purple',
  '待聯絡':'badge-amber',
  '待開案':'badge-blue',
  '待評估':'badge-amber',
  '照護中':'badge-teal',
  '展延中':'badge-purple',
  '即將結案':'badge-amber',
  '封存':'badge-gray',
};

// ── 封存類型清單：依個案 formal 欄位分成臨時／正式病歷兩套 ──
// field：選擇該類型後顯示的必填文字欄位標籤；未設定表示不需額外說明
// 「正常結案」「結案失敗」不在此清單內，改由成功結案／不成功結案按鈕鎖定觸發（見 openArchiveModal 呼叫處）
const ARCHIVE_TYPES_TEMP=[
  {type:'非PAC退案'},
  {type:'住院不收治'},
  {type:'日照不收治'},
  {type:'居家不收治'},
  {type:'決定不報到／參加',field:'原因說明',hint:'例如：家屬拒絕、病情改變等'},
  {type:'住院當日未報到',field:'原因說明'},
  {type:'日照當日未報到',field:'原因說明'},
  {type:'居家未報到/未參加',field:'原因說明'},
  {type:'資料輸入錯誤'},
  {type:'重複建立個案'},
  {type:'轉居家醫療（非PAC）',manualHidden:true}, // 僅由居家收案流程「醫師回報非PAC」鎖定觸發，不出現在手動封存選單
];
// 正式病歷手動封存僅保留資料性錯誤兩項；「非PAC」「正常結案」「結案失敗」皆走各自獨立流程（鎖定 preset 觸發 openArchiveModal，不出現在此清單）
const ARCHIVE_TYPES_FORMAL=[
  {type:'資料輸入錯誤'},
  {type:'重複建立個案'},
];

// ── 時間軸節點定義 ──
// 臨時病歷階段：共用3節點 + 依模式分岔
const TIMELINE_TEMP_COMMON=['新轉介','待補件','收案判斷中'];
const TIMELINE_TEMP_BY_MODE={
  hosp:[
    {label:'確認收案',sub:'住院'},
    {label:'待排床'},
    {label:'已預約床位',event:true},
    {label:'待聯絡',sub:'待個案／家屬確認'},
    {label:'待開案'},
  ],
  day:[
    {label:'確認收案',sub:'日照'},
    {label:'待聯絡',sub:'待個案／家屬確認'},
    {label:'待開案'},
  ],
  home:[
    {label:'待評估',sub:'待復健評估'},
    {label:'待評估',sub:'待醫師評估'},
    {label:'確認收案',sub:'居家'},
    {label:'待聯絡',sub:'待個案／家屬確認'},
    {label:'待開案'},
  ],
  general:[
    {label:'確認收案',sub:'一般復健'},
  ]
};
// 正式病歷階段：共用節點（轉正式後三模式收斂於此）
const TIMELINE_FORMAL_COMMON=[
  {label:'照護中'},
  {label:'展延中',sub:'待展延申請'},
  {label:'展延中',sub:'審核中'},
  {label:'展延結果',event:true,sub:'成功 / 失敗'},
  {label:'照護中',sub:'展延後'},
  {label:'即將結案',sub:'結案兩週前提醒'},
];



// ── 表單清單（依照護模式）──
// type:'link' 表示點擊後跳轉提示彈窗，不開內部填寫頁（評估總表→評估量表模組、復健排班→復健排班模組）
const FORMS={
  hosp:{
    common:[
      {icon:'📋',name:'個案綜合評估報告書（評估總表）',meta:'自動帶入評估週數與日期',status:'done',type:'link',linkTarget:'評估量表模組'},
      {icon:'📄',name:'PAC 照護模式記錄表',meta:'個管師建立',status:'required'},
      {icon:'📝',name:'PAC 會議記錄',meta:'空白表單，填上個案資料',status:'pending'},
      {icon:'💬',name:'醫病溝通會議記錄',meta:'空白表單，填上個案資料',status:'pending'},
      {icon:'📃',name:'專審表',meta:'送展延需要',status:'required'},
      {icon:'🏥',name:'出院準備資料',meta:'住院個案適用',status:'pending'},
    ],
    post:[
      {icon:'😊',name:'PAC 個案滿意度調查表',meta:'結案後建立',status:'pending'},
      {icon:'📊',name:'PAC 個案出院追蹤記錄表',meta:'結案後建立',status:'pending'},
    ]
  },
  day:{
    common:[
      {icon:'📋',name:'個案綜合評估報告書（評估總表）',meta:'自動帶入評估週數與日期',status:'done',type:'link',linkTarget:'評估量表模組'},
      {icon:'📄',name:'PAC 照護模式記錄表',meta:'個管師建立',status:'required'},
      {icon:'📝',name:'PAC 會議記錄',meta:'空白表單',status:'pending'},
      {icon:'💬',name:'醫病溝通會議記錄',meta:'空白表單',status:'pending'},
      {icon:'📃',name:'專審表',meta:'送展延需要',status:'required'},
      {icon:'📅',name:'日照執行記錄表',meta:'人員安排串接復健排班',status:'pending'},
      {icon:'💰',name:'患者門診費用明細（日照）',meta:'人員安排串接復健排班',status:'pending'},
    ],
    post:[
      {icon:'😊',name:'PAC 個案滿意度調查表',meta:'結案後建立',status:'pending'},
      {icon:'📊',name:'PAC 個案出院追蹤記錄表',meta:'結案後建立',status:'pending'},
    ]
  },
  home:{
    common:[
      {icon:'📋',name:'個案綜合評估報告書（評估總表）',meta:'自動帶入評估週數與日期',status:'done',type:'link',linkTarget:'評估量表模組'},
      {icon:'📄',name:'PAC 照護模式記錄表',meta:'個管師建立',status:'required'},
      {icon:'📝',name:'PAC 會議記錄',meta:'空白表單',status:'pending'},
      {icon:'💬',name:'醫病溝通會議記錄',meta:'空白表單',status:'pending'},
      {icon:'📃',name:'專審表',meta:'送展延需要',status:'required'},
      {icon:'💰',name:'患者門診費用明細（居家）',meta:'人員安排串接居家排班',status:'required'},
      {icon:'📋',name:'PAC 居家復健治療紀錄',meta:'人員安排串接居家排班',status:'pending'},
      {icon:'🏠',name:'居家環境評估暨危險因子檢核表',meta:'初次居家訪視',status:'pending'},
      {icon:'📅',name:'居家復健排班表',meta:'人員安排串接居家排班',status:'pending'},
    ],
    post:[
      {icon:'😊',name:'PAC 個案滿意度調查表',meta:'結案後建立',status:'pending'},
      {icon:'📊',name:'PAC 個案出院追蹤記錄表',meta:'結案後建立',status:'pending'},
      {icon:'🏥',name:'PAC 居家訪視護理記錄表',meta:'結案後建立・僅居家個案適用',status:'pending'},
    ]
  },
  general:{
    common:[
      {icon:'📋',name:'復健評估記錄（一般）',meta:'非PAC標準表單',status:'pending'},
      {icon:'📝',name:'家屬聯繫紀錄',meta:'',status:'done'},
    ],
    post:[]
  }
};

// ── 表單填寫內容 ──
const FORM_FILL_CONTENT={
  '個案綜合評估報告書（評估總表）':{
    sections:[
      {title:'個案基本資料（自動帶入）',fields:[
        {label:'個案姓名',value:'陳建國',readonly:true,type:'text'},
        {label:'病歷號',value:'00073450',readonly:true,type:'text'},
        {label:'照護模式',value:'住院',readonly:true,type:'text'},
        {label:'PAC 疾病別',value:'CVA（腦中風）',readonly:true,type:'text'},
        {label:'上游醫院',value:'臺大醫院',readonly:true,type:'text'},
        {label:'主治醫師',value:'張宗達 醫師',readonly:true,type:'text'},
        {label:'入院日期',value:'2026/06/10',readonly:true,type:'text'},
        {label:'預計出院日期',value:'2026/09/02',readonly:true,type:'text'},
        {label:'療程週期',value:'12 週',readonly:true,type:'text'},
      ]},
      {title:'評估次別總覽',table:true,rows:[
        {label:'初評',date:'2026/06/11',week:'第1週',pt:'Br.III',ot:'30分',st:'輕度',status:'done'},
        {label:'複評1',date:'2026/06/25',week:'第3週',pt:'待填',ot:'待填',st:'完成',status:'pending'},
        {label:'複評2',date:'2026/07/16',week:'第6週',pt:'—',ot:'—',st:'—',status:'future'},
        {label:'結案',date:'2026/09/01',week:'第12週',pt:'—',ot:'—',st:'—',status:'future'},
      ]},
    ]
  },
  'PAC 照護模式記錄表':{
    sections:[
      {title:'基本資料',fields:[
        {label:'個案姓名',value:'陳建國',readonly:true,type:'text'},
        {label:'病歷號',value:'00073450',readonly:true,type:'text'},
        {label:'照護模式',value:'住院',type:'select',options:['住院','日照','居家']},
        {label:'收案日期',value:'2026/06/10',type:'text'},
      ]},
      {title:'照護模式紀錄',fields:[
        {label:'模式說明',value:'住院 PAC，CVA 復健療程，預計 12 週',type:'textarea'},
        {label:'特殊注意事項',value:'右側偏癱，需輪椅輔助，家屬已告知注意事項',type:'textarea'},
        {label:'記錄人員',value:'林美惠',type:'text'},
        {label:'記錄日期',value:'2026/06/10',type:'text'},
      ]}
    ]
  },
  'PAC 會議記錄':{
    sections:[
      {title:'會議基本資料',fields:[
        {label:'個案姓名',value:'陳建國',readonly:true,type:'text'},
        {label:'會議日期',value:'2026/06/10',type:'text'},
        {label:'會議地點',value:'5樓會議室',type:'text'},
        {label:'主持人',value:'林美惠',type:'text'},
      ]},
      {title:'出席人員',fields:[
        {label:'個管師',value:'林美惠',type:'text'},
        {label:'醫師',value:'張宗達',type:'text'},
        {label:'復健治療師',value:'黃志豪（PT）、李佳穎（OT）',type:'text'},
        {label:'護理師',value:'陳玉玲',type:'text'},
      ]},
      {title:'會議記錄',fields:[
        {label:'個案狀況摘要',value:'72歲男性，CVA 發作後右側偏癱，符合 PAC 收案條件，預計住院 12 週復健療程。',type:'textarea'},
        {label:'治療目標',value:'改善右側肢體功能，提升 ADL 獨立性，目標 Barthel Index 由 30 分提升至 60 分以上。',type:'textarea'},
        {label:'其他決議',value:'',type:'textarea'},
      ]}
    ]
  },
  '出院準備資料':{
    sections:[
      {title:'出院基本資料',fields:[
        {label:'預計出院日期',value:'2026/09/02',type:'text'},
        {label:'出院去向',value:'',type:'select',options:['返家','轉長照機構','轉其他醫院','其他']},
        {label:'出院方式',value:'',type:'select',options:['步行','輪椅','擔架']},
      ]},
      {title:'出院後安排',fields:[
        {label:'後續復健計畫',value:'門診復健，每週 2 次',type:'textarea'},
        {label:'轉介服務',value:'長照服務評估中',type:'textarea'},
        {label:'衛教事項',value:'',type:'textarea'},
        {label:'回診安排',value:'2026/09/09 復健科門診',type:'text'},
      ]}
    ]
  },
  '居家環境評估暨危險因子檢核表':{
    sections:[
      {title:'居家環境評估',fields:[
        {label:'居住地址',value:'台北市大安區',type:'text'},
        {label:'居住型態',value:'',type:'select',options:['公寓（無電梯）','公寓（有電梯）','透天厝','社區大樓']},
        {label:'樓層',value:'3',type:'text'},
      ]},
      {title:'危險因子檢核',checklist:true,items:[
        '地板是否有防滑處理',
        '浴室是否有扶手',
        '通道是否有足夠寬度（輪椅可通行）',
        '床高是否適當',
        '照明是否充足',
        '是否有門檻需克服',
      ]},
      {title:'評估結論',fields:[
        {label:'環境危險等級',value:'',type:'select',options:['低風險','中風險','高風險']},
        {label:'建議改善事項',value:'',type:'textarea'},
        {label:'評估人員',value:'黃志豪',type:'text'},
        {label:'評估日期',value:'2026/06/20',type:'text'},
      ]}
    ]
  },
};

// ── 頁面渲染 ──
function renderPage(page,caseId,formName){
  currentPage=page;
  const content=document.getElementById('main-content');
  if(page==='list') renderList(content);
  else if(page==='detail') renderDetail(content,caseId);
  else if(page==='form') renderFormFill(content,caseId,formName);
  else if(page==='his-record') renderHisRecord(content,caseId);
}

let currentListTab='temp'; // 'temp' | 'formal' | 'archive'
let tabView={temp:'card',formal:'card'}; // 各 Tab 各自的視圖狀態：'card' or 'list'（封存 Tab 僅列表視圖，不記錄於此）
let listSelection={temp:null,formal:null,archive:null}; // 列表視圖（左右分割）時，各 Tab 目前選中的個案 id
let archiveTypeFilter=''; // 封存 Tab：封存類型篩選（空字串＝全部封存類型）
let archiveRecordTypeFilter='all'; // 封存 Tab：病歷類型篩選 'all' | 'temp' | 'formal'
let archiveDateFrom=''; // 封存 Tab：封存日期區間篩選（起，yyyy-mm-dd）
let archiveDateTo=''; // 封存 Tab：封存日期區間篩選（訖，yyyy-mm-dd）
let listSortOrder='dateDesc'; // 個案列表排序：'dateDesc'(收案日期新→舊，預設) | 'dateAsc' | 'nameAsc' | 'closeDateAsc'

function renderList(container){
  document.getElementById('bc').textContent='個案管理';
  const isAdm=currentRole==='adm';
  const isMgr=currentRole==='mgr';
  const isDoc=currentRole==='doc';
  const isNur=currentRole==='nur';
  const isJudgeRole=isDoc||isNur;

  const allCases=[...CASES.temp,...CASES.formal];
  const countBy=(status)=>allCases.filter(c=>c.status===status&&c.status!=='封存').length;
  const urgentExtend=allCases.filter(c=>c.countdown!==null&&c.countdown<=3).length;
  const warnExtend=allCases.filter(c=>c.countdown!==null&&c.countdown>3&&c.countdown<=7).length;
  const closingSoon=allCases.filter(c=>c.status==='即將結案');
  const modeCount={hosp:0,day:0,home:0,general:0};
  allCases.forEach(c=>{if(c.modeType)modeCount[c.modeType]++});
  const pendingHomeReportCount=CASES.temp.filter(isPendingHomeDoctorReport).length;
  const nurseNotifiedCases=allCases.filter(c=>c.nurseNotified);

  // 醫師／護理師視角：套用狀態篩選（唯讀查閱）；醫師視角另有「居家訪視/院內診察待回報」專屬篩選，兩者互斥（設定其一時清空另一）
  const applyRoleFilter=(arr)=>{
    if(isDoc&&docHomeReportFilterActive) return arr.filter(isPendingHomeDoctorReport);
    if(isJudgeRole&&roleFilterStatus) return arr.filter(c=>c.status===roleFilterStatus);
    return arr;
  };

  const tempActive=sortCases(applyRoleFilter(CASES.temp.filter(c=>c.status!=='封存')));
  const formalActive=sortCases(applyRoleFilter(CASES.formal.filter(c=>c.status!=='封存')));
  const archiveCasesAll=allCases.filter(c=>c.status==='封存');
  // 封存 Tab：病歷類型／封存類型／封存日期區間篩選同時作用（AND），篩選後再依排序方式排列
  const archiveCases=sortCases(archiveCasesAll.filter(c=>{
    if(archiveRecordTypeFilter==='temp'&&c.formal) return false;
    if(archiveRecordTypeFilter==='formal'&&!c.formal) return false;
    if(archiveTypeFilter&&c.archiveType!==archiveTypeFilter) return false;
    if(archiveDateFrom||archiveDateTo){
      const d=c.archiveDate?new Date(c.archiveDate.replace(/\//g,'-')):null;
      if(!d||isNaN(d)) return false;
      if(archiveDateFrom&&d<new Date(archiveDateFrom)) return false;
      if(archiveDateTo&&d>new Date(archiveDateTo)) return false;
    }
    return true;
  }));
  const tabCaseMap={temp:tempActive,formal:formalActive,archive:archiveCases};
  const currentTabCases=tabCaseMap[currentListTab];
  const isSplitView=currentListTab==='archive'||tabView[currentListTab]==='list';

  // 列表（左右分割）視圖：先確定選中個案，讓側邊欄 highlight 與右側詳情頁一致
  if(isSplitView){
    let sel=listSelection[currentListTab];
    if(!sel||!currentTabCases.find(c=>c.id===sel)) sel=currentTabCases.length?currentTabCases[0].id:null;
    listSelection[currentListTab]=sel;
  }

  let tabBodyHtml='';
  if(currentListTab==='archive'){
    const archiveEmptyMsg=archiveCasesAll.length?'沒有符合條件的封存個案':'目前沒有封存個案';
    tabBodyHtml=`
      ${archiveFilterBar()}
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:12px;max-height:calc(100vh - 340px);overflow-y:auto">
          ${archiveCases.length?archiveCases.map(c=>caseListSidebarItem(c,'archive')).join(''):`<div style="text-align:center;padding:20px 8px;color:var(--gray-400);font-size:12px">${archiveEmptyMsg}</div>`}
        </div>
        <div id="list-detail-panel" style="flex:1;min-width:0"></div>
      </div>
    `;
  } else if(tabView[currentListTab]==='card'){
    tabBodyHtml=`<div class="case-grid">${currentTabCases.map(c=>caseCard(c)).join('')}</div>`;
  } else {
    tabBodyHtml=`
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:12px;max-height:calc(100vh - 340px);overflow-y:auto">
          ${currentTabCases.length?currentTabCases.map(c=>caseListSidebarItem(c,currentListTab)).join(''):`<div style="text-align:center;padding:20px 8px;color:var(--gray-400);font-size:12px">目前沒有個案</div>`}
        </div>
        <div id="list-detail-panel" style="flex:1;min-width:0"></div>
      </div>
    `;
  }

  container.innerHTML=`
    ${isJudgeRole?`
    <div style="background:var(--amber-light);border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:13px;font-weight:600;color:var(--amber);cursor:pointer" onclick="filterByJudgeQueue()">
      ⚠️ ${countBy('收案判斷中')} 筆個案待您完成收案判斷
    </div>
    `:''}
    ${isDoc?`
    <div style="background:var(--blue-light);border:1px solid var(--blue-mid);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;font-weight:600;color:var(--blue);cursor:pointer" onclick="filterPendingHomeDoctorReport()">
      🏠 ${pendingHomeReportCount} 筆居家訪視/院內診察個案待您完成回報
    </div>
    `:''}
    ${isNur?renderNurseSummaryQueue(nurseNotifiedCases):''}
    ${(isDoc||isNur)?`<button class="btn btn-ghost btn-sm" style="margin-bottom:16px" onclick="resetRoleFilters()">查看所有個案</button>`:''}
    ${isAdm?pendingRecordsBlock():''}
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:18px;font-weight:700">個案管理</div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:3px">共 ${allCases.length} 位個案・住院 ${modeCount.hosp}・日照 ${modeCount.day}・居家 ${modeCount.home}・一般 ${modeCount.general}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${isMgr?`<button class="btn btn-primary" onclick="openModal('modal-new')">＋ 新增個案</button>`:''}
      </div>
    </div>

    ${(!isDoc&&!isNur)?`
    <!-- 統計卡：上排7個常態狀態（移除新轉介）；醫師／護理師視角改以任務導向佇列取代，見上方提示區塊 -->
    <div class="stats-row">
      <div class="stat-card" onclick="filterByStatus('收案判斷中')">
        <div class="stat-label">收案判斷中</div>
        <div class="stat-value">${countBy('收案判斷中')}</div>
        <div class="stat-sub">個管師/醫師判斷</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('待補件')">
        <div class="stat-label">待補件</div>
        <div class="stat-value">${countBy('待補件')}</div>
        <div class="stat-sub">待上游補件</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('待排床')">
        <div class="stat-label">待排床</div>
        <div class="stat-value">${countBy('待排床')}</div>
        <div class="stat-sub">住院個案</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('待聯絡')">
        <div class="stat-label">待聯絡</div>
        <div class="stat-value">${countBy('待聯絡')}</div>
        <div class="stat-sub">待家屬確認</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('待評估')">
        <div class="stat-label">待評估</div>
        <div class="stat-value">${countBy('待評估')}</div>
        <div class="stat-sub">居家收治評估</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('照護中')">
        <div class="stat-label">照護中</div>
        <div class="stat-value">${countBy('照護中')}</div>
        <div class="stat-sub">PAC 進行中</div>
      </div>
      <div class="stat-card" onclick="filterByStatus('展延中')">
        <div class="stat-label">展延中</div>
        <div class="stat-value">${countBy('展延中')}</div>
        <div class="stat-sub">展延申請中</div>
      </div>
    </div>

    <!-- 提醒卡：展延倒數（獨立雙階段）＋ 即將結案提醒（整合原本卡片與文字列） -->
    <div class="stats-row">
      <div class="stat-card ${urgentExtend>0?'urgent':''}" style="${urgentExtend===0&&warnExtend>0?'border-color:#FDE68A;background:var(--amber-light)':''}" onclick="filterByStatus('展延中')">
        <div class="stat-label" style="${urgentExtend===0&&warnExtend>0?'color:var(--amber)':''}">⚠ 展延倒數 ≤3天（紅）／≤7天（黃）</div>
        <div class="stat-value" style="${urgentExtend===0&&warnExtend>0?'color:var(--amber)':''}">${urgentExtend} <span style="font-size:13px;font-weight:500;color:var(--amber)">+ ${warnExtend}</span></div>
        <div class="stat-sub" style="${urgentExtend===0&&warnExtend>0?'color:var(--amber)':''}">紅色急需優先處理・黃色提前準備</div>
      </div>
      <div class="stat-card" style="border-color:#DDD6FE;background:var(--purple-light);flex:2;min-width:280px;cursor:default">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div class="stat-label" style="color:var(--purple)">🏁 即將結案提醒</div>
            <div class="stat-value" style="color:var(--purple)">${countBy('即將結案')}</div>
            <div class="stat-sub" style="color:var(--purple)">結案兩週前提醒</div>
            ${closingSoon.length?`<div style="font-size:11px;color:var(--purple);margin-top:8px;line-height:1.6">${closingSoon.map(c=>`${c.name}（第 ${c.week} 週・${c.disease}）`).join('、')}</div>`:`<div style="font-size:11px;color:var(--gray-400);margin-top:8px">目前沒有即將結案個案</div>`}
          </div>
          <button class="btn btn-xs" style="background:var(--purple);color:var(--white);border:none;flex-shrink:0" onclick="switchTab('formal')">查看個案 →</button>
        </div>
      </div>
    </div>
    `:''}

    <!-- 搜尋列 -->
    <div class="search-bar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" placeholder="搜尋姓名、病歷號…">
      </div>
      <select class="filter-sel"><option>全部類型</option><option>住院PAC</option><option>日照PAC</option><option>居家PAC</option><option>一般</option></select>
      <select class="filter-sel" id="status-filter" onchange="onStatusFilterChange(this.value)">
        <option value="" ${isJudgeRole&&!roleFilterStatus?'selected':''}>全部狀態</option>
        <option ${isJudgeRole&&roleFilterStatus==='收案判斷中'?'selected':''}>收案判斷中</option><option ${isJudgeRole&&roleFilterStatus==='待補件'?'selected':''}>待補件</option>
        <option ${isJudgeRole&&roleFilterStatus==='確認收案'?'selected':''}>確認收案</option><option ${isJudgeRole&&roleFilterStatus==='待排床'?'selected':''}>待排床</option><option ${isJudgeRole&&roleFilterStatus==='待聯絡'?'selected':''}>待聯絡</option>
        <option ${isJudgeRole&&roleFilterStatus==='待開案'?'selected':''}>待開案</option><option ${isJudgeRole&&roleFilterStatus==='待評估'?'selected':''}>待評估</option><option ${isJudgeRole&&roleFilterStatus==='照護中'?'selected':''}>照護中</option>
        <option ${isJudgeRole&&roleFilterStatus==='展延中'?'selected':''}>展延中</option><option ${isJudgeRole&&roleFilterStatus==='即將結案'?'selected':''}>即將結案</option><option ${isJudgeRole&&roleFilterStatus==='封存'?'selected':''}>封存</option>
      </select>
      <select class="filter-sel">
        <option>全部疾病別</option>
        <option>腦中風</option><option>創傷性神經損傷</option><option>脆弱性骨折</option><option>衰弱高齡</option><option>一般（非PAC）</option>
      </select>
    </div>

    <!-- Tabs：臨時病歷 / 正式病歷 / 封存，右側為該 Tab 專屬的視圖切換 -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div class="tabs" style="margin-bottom:0">
        <div class="tab ${currentListTab==='temp'?'active':''}" onclick="switchTab('temp')">臨時病歷 <span class="badge badge-amber" style="margin-left:4px">${tempActive.length}</span></div>
        <div class="tab ${currentListTab==='formal'?'active':''}" onclick="switchTab('formal')">正式病歷 <span class="badge badge-blue" style="margin-left:4px">${formalActive.length}</span></div>
        <div class="tab ${currentListTab==='archive'?'active':''}" onclick="switchTab('archive')" style="color:var(--gray-400)">封存 <span class="badge badge-gray" style="margin-left:4px">${archiveCasesAll.length}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <select class="filter-sel" id="sort-order-select" onchange="onSortOrderChange(this.value)">
          <option value="dateDesc" ${listSortOrder==='dateDesc'?'selected':''}>收案日期（新→舊）</option>
          <option value="dateAsc" ${listSortOrder==='dateAsc'?'selected':''}>收案日期（舊→新）</option>
          <option value="nameAsc" ${listSortOrder==='nameAsc'?'selected':''}>姓名筆畫排序</option>
          <option value="closeDateAsc" ${listSortOrder==='closeDateAsc'?'selected':''}>預估出院日期（近→遠）</option>
        </select>
        ${currentListTab!=='archive'?`<div class="view-toggle">
          <button class="view-toggle-btn ${tabView[currentListTab]==='card'?'active':''}" onclick="switchView('card')">▦ 卡片</button>
          <button class="view-toggle-btn ${tabView[currentListTab]==='list'?'active':''}" onclick="switchView('list')">☰ 列表</button>
        </div>`:''}
      </div>
    </div>
    <div style="border-bottom:2px solid var(--gray-200);margin-bottom:16px"></div>

    ${tabBodyHtml}
  `;

  // 列表（左右分割）視圖：於右側面板渲染選中個案的完整詳情頁
  if(isSplitView){
    const panel=document.getElementById('list-detail-panel');
    const sel=listSelection[currentListTab];
    if(panel){
      if(sel) renderDetail(panel,sel);
      else panel.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--gray-400);font-size:13px">請從左側選擇個案</div>`;
    }
  }
}

// ── 列表（左右分割）視圖：左側個案迷你列表項目 ──
function caseListSidebarItem(c,tabKey){
  const age=c.birthDate?calcAge(c.birthDate):null;
  const selected=listSelection[tabKey]===c.id;
  const statusBadge=tabKey==='archive'
    ? `<span class="badge badge-gray">封存</span><span style="font-size:10px;color:var(--gray-400);margin-left:4px">・${c.archiveType||''}</span>`
    : `<span class="badge ${STATUS_COLOR[c.status]||'badge-gray'}">${c.status}</span>`;
  return `<div style="padding:10px 10px;border-radius:7px;cursor:pointer;${selected?'background:var(--blue-light);border:1px solid var(--blue-mid)':'border:1px solid transparent'}">
    <div onclick="selectListCase('${tabKey}','${c.id}')">
      <div style="font-size:13px;font-weight:600;color:${selected?'var(--blue)':'var(--gray-800)'}">${c.name}${age!==null?`<span style="font-size:11px;color:var(--gray-400);font-weight:500">(${age})</span>`:''}</div>
      <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${c.mode}・${c.disease}</div>
      <div style="margin-top:5px">${statusBadge}</div>
    </div>
    ${tabKey==='archive'?`<button class="btn btn-ghost btn-xs" style="margin-top:6px;width:100%" onclick="event.stopPropagation();openRestoreModal('${c.id}','${c.name}')">🔄 回復資料</button>`:''}
  </div>`;
}

// ── 回復資料 Modal ──
function openRestoreModal(caseId, caseName){
  // 動態注入 modal 到 DOM
  let m=document.getElementById('modal-restore');
  if(!m){
    m=document.createElement('div');
    m.id='modal-restore';
    m.className='modal-overlay hidden';
    m.innerHTML=`<div class="modal" style="max-width:440px">
      <div class="modal-header">
        <div class="modal-title">🔄 回復資料</div>
        <button class="modal-close" onclick="closeModal('modal-restore')">✕</button>
      </div>
      <div class="modal-body">
        <div class="info-note amber" style="margin-bottom:14px">回復後個案將重新進入臨時病歷列表，請選擇回復後的初始狀態。</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:12px" id="restore-name"></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--gray-200);border-radius:7px;cursor:pointer">
            <input type="radio" name="restore-status" value="收案判斷中" checked style="accent-color:var(--blue)">
            <div><div style="font-size:13px;font-weight:600">收案判斷中</div><div style="font-size:11px;color:var(--gray-400)">資料齊全，需重新進行 PAC 收案判斷</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--gray-200);border-radius:7px;cursor:pointer">
            <input type="radio" name="restore-status" value="待補件" style="accent-color:var(--blue)">
            <div><div style="font-size:13px;font-weight:600">待補件</div><div style="font-size:11px;color:var(--gray-400)">資料尚不完整，需等待上游補件後再判斷</div></div>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-restore')">取消</button>
        <button class="btn btn-primary" onclick="confirmRestore()">確認回復</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden');});
  }
  document.getElementById('restore-name').textContent=`個案：${caseName}`;
  m.dataset.caseId=caseId;
  openModal('modal-restore');
}

function confirmRestore(){
  const m=document.getElementById('modal-restore');
  const caseId=m.dataset.caseId;
  const sel=m.querySelector('input[name="restore-status"]:checked');
  const status=sel?sel.value:'收案判斷中';
  closeModal('modal-restore');
  alert(`個案已回復！狀態更新為「${status}」，已移回臨時病歷列表。`);
}

function switchTab(tabKey){
  currentListTab=tabKey;
  renderList(document.getElementById('main-content'));
}
function onSortOrderChange(val){
  listSortOrder=val;
  renderList(document.getElementById('main-content'));
}
function switchView(view){
  if(currentListTab==='archive') return; // 封存 Tab 僅列表視圖，無切換
  tabView[currentListTab]=view;
  renderList(document.getElementById('main-content'));
}
function selectListCase(tabKey,caseId){
  listSelection[tabKey]=caseId;
  const jumpTab=resolveQueueDetailTab();
  if(jumpTab){ detailActiveTab=jumpTab; detailActiveTabCaseId=caseId; }
  renderList(document.getElementById('main-content'));
}

// ── 封存 Tab：篩選區（封存類型 + 病歷類型 + 封存日期區間，皆同時作用）──
function archiveFilterBar(){
  const formalPresetTypes=['非PAC個案','正常結案','結案失敗']; // 不在 ARCHIVE_TYPES_FORMAL 內，走各自獨立流程觸發，但仍為封存類型篩選選項
  return `
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
    <select class="filter-sel" onchange="onArchiveTypeFilterChange(this.value)">
      <option value="" ${archiveTypeFilter===''?'selected':''}>全部封存類型</option>
      <optgroup label="── 臨時病歷 ──">
        ${ARCHIVE_TYPES_TEMP.map(o=>`<option value="${o.type}" ${archiveTypeFilter===o.type?'selected':''}>${o.type}</option>`).join('')}
      </optgroup>
      <optgroup label="── 正式病歷 ──">
        ${formalPresetTypes.map(t=>`<option value="${t}" ${archiveTypeFilter===t?'selected':''}>${t}</option>`).join('')}
        ${ARCHIVE_TYPES_FORMAL.map(o=>`<option value="${o.type}" ${archiveTypeFilter===o.type?'selected':''}>${o.type}</option>`).join('')}
      </optgroup>
    </select>
    <div style="display:flex;align-items:center;gap:6px">
      <input type="date" class="form-control" style="width:150px" value="${archiveDateFrom}" onchange="onArchiveDateFilterChange('from',this.value)">
      <span style="font-size:12px;color:var(--gray-400)">至</span>
      <input type="date" class="form-control" style="width:150px" value="${archiveDateTo}" onchange="onArchiveDateFilterChange('to',this.value)">
    </div>
    <div style="display:flex;gap:4px;background:var(--gray-100);padding:3px;border-radius:8px">
      <button class="btn ${archiveRecordTypeFilter==='all'?'btn-secondary':'btn-ghost'} btn-xs" onclick="setArchiveRecordTypeFilter('all')">全部</button>
      <button class="btn ${archiveRecordTypeFilter==='temp'?'btn-secondary':'btn-ghost'} btn-xs" onclick="setArchiveRecordTypeFilter('temp')">臨時病歷</button>
      <button class="btn ${archiveRecordTypeFilter==='formal'?'btn-secondary':'btn-ghost'} btn-xs" onclick="setArchiveRecordTypeFilter('formal')">正式病歷</button>
    </div>
  </div>`;
}
function onArchiveTypeFilterChange(val){
  archiveTypeFilter=val;
  renderList(document.getElementById('main-content'));
}
function onArchiveDateFilterChange(which,val){
  if(which==='from') archiveDateFrom=val;
  else archiveDateTo=val;
  renderList(document.getElementById('main-content'));
}
function setArchiveRecordTypeFilter(val){
  archiveRecordTypeFilter=val;
  renderList(document.getElementById('main-content'));
}

function filterByStatus(status){
  document.getElementById('status-filter').value=status;
  onStatusFilterChange(status);
}
function onStatusFilterChange(status){
  if(currentRole==='doc'||currentRole==='nur'){
    // 醫師／護理師視角：篩選僅限縮目前 Tab 內容（唯讀查閱），不切換 Tab
    docHomeReportFilterActive=false;
    roleFilterStatus=status||null;
    renderList(document.getElementById('main-content'));
    return;
  }
  // 個管師／行政：維持現有行為，切到含目標狀態個案較多的 tab（prototype 簡化處理）
  const inFormal=CASES.formal.some(c=>c.status===status);
  const inTemp=CASES.temp.some(c=>c.status===status);
  if(inFormal&&!inTemp) switchTab('formal');
  else if(inTemp&&!inFormal) switchTab('temp');
}

// 醫師視角：鎖定只看「待居家到宅評估回報」個案，清單呈現方式比照收案判斷篩選（僅限縮列表，不切換 Tab）
function filterPendingHomeDoctorReport(){
  if(currentRole!=='doc') return;
  docHomeReportFilterActive=true;
  roleFilterStatus=null; // 與收案判斷篩選互斥，避免 resolveQueueDetailTab 誤判跳錯 Tab
  currentListTab='temp'; // 待回報個案皆為臨時病歷階段
  renderList(document.getElementById('main-content'));
}
// 醫師／護理師共用：「待PAC判斷」佇列
function filterByJudgeQueue(){
  if(currentRole!=='doc'&&currentRole!=='nur') return;
  roleFilterStatus='收案判斷中';
  docHomeReportFilterActive=false;
  currentListTab='temp';
  renderList(document.getElementById('main-content'));
}
// 醫師／護理師：清空所有佇列篩選，恢復顯示完整個案清單
function resetRoleFilters(){
  if(currentRole!=='doc'&&currentRole!=='nur') return;
  roleFilterStatus=null;
  docHomeReportFilterActive=false;
  renderList(document.getElementById('main-content'));
}

// 護理師視角：「待查看病摘」佇列，內含每筆個案的獨立「✕」關閉按鈕
function renderNurseSummaryQueue(cases){
  return `
  <div style="background:var(--blue-light);border:1px solid var(--blue-mid);border-radius:10px;padding:12px 16px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;color:var(--blue);${cases.length?'margin-bottom:8px':''}">📋 ${cases.length} 筆個案待您查看病摘</div>
    ${cases.length?`<div style="display:flex;flex-direction:column;gap:4px">
      ${cases.map(c=>`
      <div style="background:var(--white);border-radius:6px;padding:6px 10px;cursor:pointer" onclick="goToCaseTab('${c.id}','summary')">
        <span style="font-size:12px;color:var(--gray-700)">${c.name}（${c.mode}・${c.disease}）</span>
      </div>`).join('')}
    </div>`:''}
  </div>`;
}

// 待辦清單個案點擊：進入詳情頁前先指定要開啟的 Tab（沿用 detailActiveTab 機制）
function goToCaseTab(caseId,tabKey){
  detailActiveTab=tabKey;
  detailActiveTabCaseId=caseId;
  renderPage('detail',caseId);
}
// 依目前作用中的醫師／護理師佇列篩選，判斷點擊個案後應開啟的 Tab；無特定佇列時回傳 null（維持預設「總覽」）
function resolveQueueDetailTab(){
  if(currentRole==='doc'||currentRole==='nur'){
    if(roleFilterStatus==='收案判斷中') return 'judge';
  }
  if(currentRole==='doc'){
    if(docHomeReportFilterActive) return 'flow';
  }
  return null;
}

// ── 行政視角：待建檔通知區塊 ──
function pendingRecordsBlock(){
  if(!PENDING_RECORDS.length) return '';
  return `
  <div style="background:var(--amber-light);border:1px solid #FDE68A;border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:14px;font-weight:700;color:var(--amber);margin-bottom:10px">📋 待建檔通知</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${PENDING_RECORDS.map(r=>`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--white);border-radius:8px;padding:10px 14px">
          <div style="font-size:12px;color:var(--gray-700);line-height:1.7">
            <strong style="font-size:13px">${r.name}${r.age!==undefined?`（${r.age}歲）`:''}</strong><br>
            ${r.mode}・${r.disease}<br>
            個管師 ${r.mgr} 按下轉正式病歷時間：${r.convertedAt}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="form-control" type="text" placeholder="輸入病歷號" id="pr-input-${r.id}" style="width:160px">
            <button class="btn btn-primary btn-sm" onclick="confirmPendingRecord('${r.id}')">確認建檔</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}
function confirmPendingRecord(id){
  const input=document.getElementById(`pr-input-${id}`);
  const val=input?input.value.trim():'';
  if(!val){alert('請輸入病歷號');return;}
  PENDING_RECORDS=PENDING_RECORDS.filter(r=>r.id!==id);
  alert('病歷號已輸入，系統將自動從杏翔匯入科別與主治醫師，個案已正式轉入正式病歷 Tab，系統將通知負責個管師。');
  renderPage('list');
}



function caseCard(c){
  const modeClass={hosp:'ms-hosp',day:'ms-day',home:'ms-home',general:'ms-general'}[c.modeType]||'ms-general';
  const statusBadge=`<span class="badge ${STATUS_COLOR[c.status]||'badge-gray'}">${c.status}</span>`;
  const isClosingSoon=c.status==='即將結案';
  const countdown=c.countdown?`<span class="countdown-badge">展延 ${c.countdown} 天</span>`:'';
  const weekBadge=c.week?`<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${isClosingSoon?'var(--purple-light)':'var(--gray-100)'};color:${isClosingSoon?'var(--purple)':'var(--gray-500)'}">第 ${c.week} 週 / 12</span>`:'';
  const modeLabel={hosp:'🏥 住院 PAC',day:'☀️ 日照 PAC',home:'🏡 居家 PAC',general:'🏋️ 一般'}[c.modeType]||c.mode;
  const cardBorder=isClosingSoon?'border-color:#DDD6FE;':'';
  const age=c.birthDate?calcAge(c.birthDate):null;
  const nameWithAge=`${c.name}${age!==null?`<span style="font-size:12px;color:var(--gray-400);font-weight:500">(${age})</span>`:''}`;
  const queueJumpTab=resolveQueueDetailTab();
  const detailOnclick=queueJumpTab?`goToCaseTab('${c.id}','${queueJumpTab}')`:`renderPage('detail','${c.id}')`;

  if(currentRole==='adm'){
    return `<div class="case-card" style="${cardBorder}" onclick="${detailOnclick}">
      <div class="mode-stripe ${modeClass}"></div>
      <div class="case-card-header"><div><div class="case-name">${nameWithAge}</div><div class="case-id">${c.mode}・${c.disease}</div></div>${statusBadge}</div>
      <div class="admin-key-field"><label>身分證字號</label><span>A123456789</span></div>
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:7px">
        <div class="case-field"><label>入院日期</label><span>${c.date}</span></div>
        <div class="case-field"><label>床位</label><span>${c.formal?'A301':'待確認'}</span></div>
      </div>
    </div>`;
  }

  return `<div class="case-card" style="${cardBorder}" onclick="${detailOnclick}">
    <div class="mode-stripe ${modeClass}"></div>
    ${isClosingSoon?`<div style="font-size:11px;color:var(--purple);font-weight:600;background:var(--purple-light);padding:5px 10px;margin:-3px -3px 10px;border-radius:3px">🏁 療程即將結束・請準備結案評估</div>`:''}
    <div class="case-card-header"><div><div class="case-name">${nameWithAge}</div><div class="case-id">${modeLabel}・${c.disease}</div></div>${statusBadge}</div>
    <div class="case-card-body">
      ${c.formal?`
      <div class="case-field"><label>照護模式</label><span>${c.mode}</span></div>
      <div class="case-field"><label>疾病別</label><span>${c.disease}</span></div>
      <div class="case-field"><label>開案日期</label><span>${c.openDate||'—'}</span></div>
      <div class="case-field"><label>預計結案日期</label><span>${c.closeDate||'—'}</span></div>
      `:`
      <div class="case-field"><label>照護模式</label><span>${c.mode}</span></div>
      <div class="case-field"><label>轉介來源</label><span>${c.source}</span></div>
      <div class="case-field"><label>轉介日期</label><span>${c.date}</span></div>
      <div class="case-field"><label>疾病別</label><span>${c.disease}</span></div>
      `}
    </div>
    <div class="case-card-footer">
      <div class="case-manager"><div class="mini-av">林</div>${c.mgr}</div>
      <div style="display:flex;gap:5px;align-items:center">
        ${weekBadge}
        ${countdown||(!isClosingSoon&&!c.week?statusBadge:'')}
      </div>
    </div>
  </div>`;
}

function renderDetail(container,caseId){
  currentCase=caseId;
  if(summaryEditCaseId!==caseId){ summaryEditMode=false; summaryEditCaseId=caseId; }
  if(detailActiveTabCaseId!==caseId){ detailActiveTab='overview'; detailActiveTabCaseId=caseId; }
  if(bedAssignFormCaseId!==caseId){ bedAssignFormOpen=false; bedAssignFormCaseId=caseId; }
  const allCases=[...CASES.temp,...CASES.formal];
  const c=allCases.find(x=>x.id===caseId)||CASES.formal[0];
  document.getElementById('bc').textContent=`個案管理 › ${c.name}`;

  const isMgr=currentRole==='mgr';
  const isDoc=currentRole==='doc';
  const isNur=currentRole==='nur';
  const isAdm=currentRole==='adm';
  const isFormal=c.formal;

  // 動態組裝完整時間軸：臨時階段(共用3+依模式分岔) + 正式階段(共用，轉正式後才接上)
  const steps=buildTimeline(c);

  // 行政視角：重點欄位放大顯示
  const adminKeyFields=isAdm?`
    <div class="info-note amber" style="margin-bottom:12px">⚠️ 以下欄位請仔細核對後登打至杏翔系統，身分證字號打錯將影響所有健保申報。</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="admin-key-field"><label>👤 姓名</label><span>${c.name}</span></div>
      <div class="admin-key-field"><label>🪪 身分證字號</label><span>A123456789</span></div>
      <div class="admin-key-field"><label>📅 出生日期</label><span>1952/08/20</span></div>
      <div class="admin-key-field"><label>🏥 照護模式</label><span>${c.mode}</span></div>
      <div class="admin-key-field"><label>🛏 床號</label><span>${isFormal?'A301':'待確認'}</span></div>
      <div class="admin-key-field"><label>📋 病歷號</label><span>${isFormal?'00073450':'—'}</span></div>
    </div>
  `:'';

  // 操作按鈕
  let actions='';
  if(isMgr){
    if(!isFormal) actions=`
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-translate')">📄 病摘翻譯</button>
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-judge')">🩺 轉交判斷</button>
      <button class="btn btn-ghost btn-sm" onclick="openConvertModeModal()">🔁 轉換模式</button>
      <button class="btn btn-amber btn-sm" onclick="openModal('modal-convert')">→ 轉正式病歷</button>
      <button class="btn btn-secondary btn-sm" onclick="openArchiveModal({formal:false})">封存</button>
    `;
    else actions=`
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-translate')">📄 病摘翻譯</button>
      <button class="btn btn-ghost btn-sm" onclick="openConvertModeModal()">🔁 轉換模式</button>
      <button class="btn btn-ghost btn-sm" onclick="openExportExtendModal()">📤 匯出展延</button>
      <button class="btn btn-ghost btn-sm" onclick="openExportCloseModal()">📤 匯出結案</button>
      <button class="btn btn-secondary btn-sm" onclick="openArchiveModal({formal:true})">封存</button>
      <button class="btn btn-green btn-sm" onclick="openArchiveModal({formal:true,presetType:'正常結案',locked:true,showCloseDate:true,showDischargeDest:true,successMsg:()=>'已成功結案，個案移至封存'})">✓ 成功結案</button>
      <button class="btn btn-danger btn-sm" onclick="openArchiveModal({formal:true,presetType:'結案失敗',locked:true,showCloseDate:true,showDischargeDest:true,successMsg:()=>'已標記結案失敗，個案移至封存'})">不成功結案</button>
    `;
  } else if(isDoc) actions=`<span class="badge badge-amber" style="font-size:12px">醫師視角・可填寫 PAC 判斷與醫囑</span>`;
  else if(isNur) actions=`<span class="badge badge-teal" style="font-size:12px">護理師視角・可填寫護理相關欄位</span>`;
  else if(isAdm) actions=`<span class="badge badge-gray" style="font-size:12px">行政視角・唯讀模式</span>`;

  // 表單清單
  const modeKey=c.modeType||'hosp';
  const formData=FORMS[modeKey]||FORMS.hosp;
  const fsLabel={'done':'fs-done','required':'fs-required','pending':'fs-pending'};
  const fsText={'done':'已完成','required':'待填寫','pending':'未到期'};

  const formsList=(forms,title,showTitle=true)=>`
    ${showTitle?`<div style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">${title}</div>`:''}
    <div class="forms-grid">
      ${forms.map(f=>`
        <div class="form-item" onclick="${f.type==='link'?`showLinkTip('${f.name}','${f.linkTarget}')`:`renderPage('form','${caseId}','${f.name}')`}">
          <div class="form-item-left">
            <div class="form-icon">${f.icon}</div>
            <div><div class="form-name">${f.name}</div><div class="form-meta">${f.meta}</div></div>
          </div>
          <span class="form-status ${f.type==='link'?'fs-pending':fsLabel[f.status]}">${f.type==='link'?'前往 →':fsText[f.status]}</span>
        </div>
      `).join('')}
    </div>
  `;

  // PAC 判斷區塊
  const judgeBlock=isFormal?`
    <div class="section-card">
      <div class="sc-header">
        <div class="sc-title">🩺 PAC 收案判斷</div>
        <span style="font-size:10px;color:var(--gray-400)">已於臨時病歷階段完成判斷・僅供查看</span>
      </div>
      <div class="sc-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          ${judgeOption('是 PAC',true,true)}
          ${judgeOption('非 PAC',false,true)}
          ${judgeOption('需再評估',false,true)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label>判斷 PAC 疾病別</label><input class="form-control" value="${c.diseaseCategory||c.disease}" readonly></div>
          <div class="form-group"><label>判斷者</label><input class="form-control" value="${c.judgedBy||'張宗達 醫師'}" readonly></div>
          <div class="form-group" style="grid-column:1/-1"><label>判斷原因</label><textarea class="form-control" rows="2" readonly>個案符合 ${c.diseaseCategory||c.disease} PAC 收案條件，開刀位置及病摘內容確認無誤，建議收案。</textarea></div>
          <div class="form-group" style="grid-column:1/-1"><label>補充建議</label><textarea class="form-control" rows="2" readonly>建議優先安排物理及職能治療，語言治療視評估結果決定頻率。</textarea></div>
        </div>
      </div>
    </div>
  `:`
    <div class="section-card">
      <div class="sc-header">
        <div class="sc-title">🩺 PAC 收案判斷</div>
        ${!isAdm?`<button class="btn btn-ghost btn-xs" onclick="openModal('modal-judge')">🔁 轉交判斷</button>`:''}
      </div>
      <div class="sc-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          ${judgeOption('是 PAC',true,isAdm)}
          ${judgeOption('非 PAC',false,isAdm)}
          ${judgeOption('需再評估',false,isAdm)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label>判斷 PAC 疾病別</label>
            <select class="form-control" id="pac-disease-category" ${isAdm?'disabled':''}>
              <option value="">請選擇</option>
              ${['腦中風','脆弱性骨折','衰弱高齡','創傷性神經損傷'].map(d=>`<option ${((c.diseaseCategory||c.disease)===d)?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>判斷者</label>
            <select class="form-control" id="pac-judged-by" ${isAdm?'disabled':''}>
              ${JUDGE_PERSONS.map(p=>`<option ${((c.judgedBy||'張宗達 醫師')===p)?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1"><label>判斷原因</label><textarea class="form-control" rows="2" ${isAdm?'readonly':''}>個案符合 ${c.disease} PAC 收案條件，開刀位置及病摘內容確認無誤，建議收案。</textarea></div>
          <div class="form-group" style="grid-column:1/-1"><label>補充建議</label><textarea class="form-control" rows="2" ${isAdm?'readonly':''}>建議優先安排物理及職能治療，語言治療視評估結果決定頻率。</textarea></div>
        </div>
        ${!isAdm?`
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="submitPacJudgment('${caseId}')">送出判斷</button>
        </div>
        `:''}
      </div>
    </div>
  `;

  // Tab 分組（總覽／聯繫紀錄／收案流程（僅臨時）／病摘／PAC收案判斷／居家復健排班查看（僅正式居家）／文件查看（臨時與正式皆顯示）／轉介（僅正式））
  const flowTabLabel='居家收案流程';
  const detailTabs=[{key:'overview',label:'總覽'},{key:'contact',label:'聯繫紀錄'}];
  if(!isFormal&&c.modeType==='home') detailTabs.push({key:'flow',label:flowTabLabel});
  detailTabs.push({key:'summary',label:'病摘'},{key:'judge',label:'PAC收案判斷'});
  if(isFormal&&c.modeType==='home') detailTabs.push({key:'rehab',label:'居家復健排班查看'});
  detailTabs.push({key:'docs',label:'文件查看'});
  if(isFormal) detailTabs.push({key:'referral',label:'轉介'});
  if(!detailTabs.find(t=>t.key===detailActiveTab)) detailActiveTab='overview';
  const tabPanelStyle=(key)=>`display:${detailActiveTab===key?'':'none'}`;

  container.innerHTML=`
    <div class="back-link" onclick="renderPage('list')">← 返回個案列表</div>

    <!-- 詳情 header -->
    <div class="detail-header">
      <div class="detail-top">
        <div class="patient-name">
          ${c.name}${c.birthDate?`<span style="font-size:14px;color:var(--gray-400);font-weight:500">(${calcAge(c.birthDate)}歲)</span>`:''}
          <span class="badge ${STATUS_COLOR[c.status]||'badge-gray'}">${c.status}</span>
          <span class="badge badge-blue">${c.mode}</span>
          <span class="badge badge-gray">${c.disease}</span>
        </div>
        <div class="detail-actions">
          ${actions}
        </div>
      </div>
      <div class="detail-meta">
        <div class="meta-item"><strong>轉介來源：</strong>${c.source}</div>
        <div class="meta-item"><strong>轉介日期：</strong>${c.date}</div>
        ${isFormal?`<div class="meta-item"><strong>病歷號：</strong>00073450</div>`:''}
        ${isFormal&&c.mode==='住院'?`<div class="meta-item"><strong>床位：</strong>A301</div>`:''}
        <div class="meta-item"><strong>負責個管師：</strong>${c.mgr||'—'}</div>
        ${c.countdown?`<div class="meta-item" style="color:var(--red);font-weight:600">⚠️ 展延倒數 ${c.countdown} 天</div>`:''}
      </div>
    </div>

    ${adminKeyFields}

    <!-- 即將結案提醒 -->
    ${c.status==='即將結案'?`
    <div style="background:var(--purple-light);border:1px solid #DDD6FE;border-radius:10px;padding:14px 18px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--purple);margin-bottom:4px">🏁 療程即將結束</div>
        <div style="font-size:12px;color:var(--purple);line-height:1.6">目前為第 ${c.week} 週（共 12 週），系統偵測到療程進入最後階段。<br>請確認以下待辦事項，並與家屬討論後續安排。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;${c.week>=11?'background:var(--red-light);color:var(--red)':'background:#FEF3C7;color:var(--amber)'}">
            ${c.week>=11?'⚠ 結案評估應於本週完成':'結案評估應於下週完成'}
          </span>
          <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;background:var(--gray-100);color:var(--gray-600)">出院準備資料待填寫</span>
          <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;background:var(--gray-100);color:var(--gray-600)">家屬後續安排討論中</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn btn-green btn-sm" onclick="openArchiveModal({formal:true,presetType:'正常結案',locked:true,showCloseDate:true,showDischargeDest:true,successMsg:()=>'已成功結案，個案移至封存'})">✓ 成功結案</button>
        <button class="btn btn-danger btn-sm" onclick="openArchiveModal({formal:true,presetType:'結案失敗',locked:true,showCloseDate:true,showDischargeDest:true,successMsg:()=>'已標記結案失敗，個案移至封存'})">不成功結案</button>
      </div>
    </div>
    `:''}

    <!-- 封存說明 banner -->
    ${c.status==='封存'?`
    <div style="background:var(--gray-100);border:1px solid var(--gray-300);border-radius:10px;padding:14px 18px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:6px">📦 封存說明</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--gray-600)">
        <div><strong style="color:var(--gray-800)">封存類型：</strong>${c.archiveType||'—'}</div>
        <div><strong style="color:var(--gray-800)">封存日期：</strong>${c.archiveDate||'—'}</div>
        <div><strong style="color:var(--gray-800)">操作人員：</strong>${c.archiveOperator||'—'}</div>
      </div>
      ${c.archiveReason?`<div style="margin-top:8px;font-size:12px;color:var(--gray-600);background:var(--white);padding:10px;border-radius:6px">${c.archiveReason}</div>`:''}
      <div style="margin-top:8px;font-size:12px;color:var(--gray-600)">若需保留個人資料與病摘重新開案，請封存後於新增個案頁面選擇『從封存個案複製資料』。</div>
    </div>
    `:''}

    <!-- 個案進度（時間軸）：固定顯示，不隨 Tab 切換而隱藏 -->
    <div class="timeline-card">
      <div class="tc-header">
        <div class="tc-title">個案進度</div>
        <div style="display:flex;gap:10px;font-size:10px;color:var(--gray-400)">
          <span>${isFormal?'臨時病歷階段（已完成）→ 正式病歷階段':'臨時病歷階段・'+c.mode+'路徑'}</span>
        </div>
      </div>
      <div class="timeline-body">
        <div class="timeline-track">
          ${steps.map(s=>`<div class="t-step ${s.done?'done':''} ${s.active?'active':''} ${s.event?'event':''}">
            <div class="t-dot">${s.done?'✓':''}</div>
            <div class="t-label">${s.label}</div>
            ${s.sub?`<div class="t-sub">${s.sub}</div>`:''}
            ${s.active?`<div style="font-size:9px;color:var(--blue);font-weight:700;margin-top:2px">${(s.label==='收案判斷中'&&c.diseaseCategory)?'已判斷':'進行中'}</div>`:''}
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Tab 導覽列 -->
    <div class="tabs detail-tabs">
      ${detailTabs.map(t=>`<div class="tab ${detailActiveTab===t.key?'active':''}" data-tab-key="${t.key}" onclick="switchDetailTab('${t.key}')">${t.label}</div>`).join('')}
    </div>

    <!-- 總覽：（正式）展延狀態＋個案基本資料 -->
    <div class="detail-tab-panel" data-tab-key="overview" style="${tabPanelStyle('overview')}">
      <!-- 展延狀態人工切換器（健保署審核為紙本流程，需個管師手動切換）-->
      ${isFormal&&(c.status==='照護中'||c.status==='展延中')?`
      <div class="section-card">
        <div class="sc-header">
          <div class="sc-title">📨 展延狀態</div>
          <span style="font-size:10px;color:var(--gray-400)">人工紙本流程，請依實際進度手動更新</span>
        </div>
        <div class="sc-body">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="markNoExtension('${c.id}')">① 不展延</button>
            <button class="btn ${c.status==='照護中'?'btn-secondary':'btn-ghost'} btn-sm" onclick="markExtensionPending('${c.id}')">② 待送出展延</button>
            <button class="btn ${c.status==='展延中'?'btn-amber':'btn-ghost'} btn-sm" onclick="markExtensionSubmitted('${c.id}')">③ 已送出展延（審核中）</button>
            <button class="btn btn-green btn-sm" onclick="openExtensionSuccessModal('${c.id}')">④ 展延成功</button>
            <button class="btn btn-danger btn-sm" onclick="markExtensionFailed('${c.id}')">⑤ 展延失敗</button>
          </div>
          <div style="margin-top:10px;font-size:11px;color:var(--gray-400)">目前狀態：<strong style="color:var(--gray-700)">${c.status}${c.timelineSub?'・'+c.timelineSub:''}</strong></div>
        </div>
      </div>
      `:''}

      <!-- 個案基本資料 -->
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">👤 個案基本資料</div>${isMgr?`<button class="btn btn-ghost btn-xs" onclick="alert('編輯個案資料')">✏️ 編輯</button>`:''}</div>
        <div class="sc-body">
          <div class="info-grid">
            <div class="info-item"><label>姓名</label><span>${c.name}</span></div>
            <div class="info-item"><label>身分證</label><span>A123456789</span></div>
            <div class="info-item"><label>出生日期</label><span>${c.birthDate||'—'}${c.birthDate?`（${calcAge(c.birthDate)}歲）`:''}</span></div>
            <div class="info-item"><label>性別</label><span>男</span></div>
            <div class="info-item"><label>${c.modeType==='general'?'一般疾病類型':'PAC 疾病別'}</label><span>${c.disease}</span></div>
            <div class="info-item"><label>照護模式</label><span>${c.mode}</span></div>
            ${isFormal?`<div class="info-item"><label>病歷號</label><span>00073450</span></div>`:''}
            ${isFormal&&c.mode==='住院'?`<div class="info-item"><label>床位</label><span>A301</span></div><div class="info-item"><label>主治醫師</label><span>張宗達 醫師</span><div style="font-size:10px;color:var(--gray-400);margin-top:2px">由杏翔系統匯入</div></div><div class="info-item"><label>科別</label><span>${c.department||'—'}</span><div style="font-size:10px;color:var(--gray-400);margin-top:2px">由杏翔系統匯入</div></div>`:''}
            ${isFormal&&c.mode!=='住院'?`<div class="info-item"><label>科別</label><span>${c.department||'—'}</span><div style="font-size:10px;color:var(--gray-400);margin-top:2px">由杏翔系統匯入</div></div>`:''}
            ${(c.openDate||c.closeDate)?`<div class="info-item"><label>開案日</label><span>${c.openDate||'—'}</span></div><div class="info-item"><label>結案日（預估）</label><span>${c.closeDate||'—'}${(!isFormal&&isMgr)?` <a href="javascript:void(0)" style="font-size:10px;color:var(--gray-400);text-decoration:none;cursor:pointer;margin-left:4px" onclick="openEditDatesModal('${c.id}')">✏️ 修改</a>`:''}</span></div>`:''}
          </div>
          <div class="divider"></div>
          <div class="info-grid">
            <div class="info-item"><label>家屬姓名</label><span>陳小明${c.familyRelation?`（${c.familyRelation}）`:''}</span></div>
            <div class="info-item"><label>家屬電話</label><span>${c.familyPhone||'0912-345-678'}</span></div>
            <div class="info-item"><label>地址</label><span>${c.address||'—'}</span></div>
            <div class="info-item"><label>關係</label><span>${c.familyRelation||'—'}</span></div>
          </div>
          <div class="divider"></div>
          <div style="font-size:11px;color:var(--gray-400);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">上游聯絡人資料</div>
          <div class="info-grid">
            <div class="info-item"><label>聯絡人姓名</label><span>${c.upstreamContact?.name||'—'}</span></div>
            <div class="info-item"><label>聯絡電話</label><span>${c.upstreamContact?.phone||'—'}</span></div>
            <div class="info-item"><label>Line ID</label><span>${c.upstreamContact?.line||'—'}</span></div>
          </div>
        </div>
      </div>

      <!-- 床位安排（暫時性手動登記，僅住院／臨時病歷階段）-->
      ${(!isFormal&&c.modeType==='hosp')?`
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">🛏 床位安排</div></div>
        <div class="sc-body">
          ${(bedAssignFormOpen&&bedAssignFormCaseId===c.id)?(()=>{
            const defaultOpen=c.openDate?c.openDate.replace(/\//g,'-'):'2026-07-09';
            const defaultClose=c.closeDate?c.closeDate.replace(/\//g,'-'):calcCloseDateFromOpen(defaultOpen,c.diseaseCategory||c.disease);
            return `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
              <div class="form-group"><label>預計開案日期</label><input class="form-control" type="date" id="bed-assign-opendate" value="${defaultOpen}" oninput="updateBedAssignCloseDate()"></div>
              <div class="form-group"><label>預計結案日期</label><input class="form-control" type="date" id="bed-assign-closedate" value="${defaultClose}"></div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-xs" onclick="confirmBedAssign('${c.id}')">確認</button>
              <button class="btn btn-ghost btn-xs" onclick="cancelBedAssignForm()">取消</button>
            </div>
            `;
          })():(c.bedAssigned?`
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-size:12px;color:var(--green);font-weight:600">✓ 已排床，預計開案日期：${c.openDate||'—'}，預計結案日期：${c.closeDate||'—'}</div>
              ${isMgr?`<a href="javascript:void(0)" style="font-size:10px;color:var(--gray-400);text-decoration:none;cursor:pointer" onclick="openBedAssignForm('${c.id}')">✏️ 修改</a>`:''}
            </div>
          `:`
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;color:var(--gray-400)">尚未排床</span>
              ${isMgr?`<button class="btn btn-secondary btn-xs" onclick="openBedAssignForm('${c.id}')">登記已排床</button>`:''}
            </div>
          `)}
          <div style="font-size:10px;color:var(--gray-400);margin-top:8px">＊排床作業實際將於排床管理模組進行，此處為暫時性登記，待兩模組整合後串接</div>
        </div>
      </div>
      `:''}
    </div>

    <!-- 聯繫紀錄：家屬聯繫紀錄＋上游聯繫紀錄 -->
    <div class="detail-tab-panel" data-tab-key="contact" style="${tabPanelStyle('contact')}">
      <!-- 家屬聯繫紀錄 -->
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">📞 家屬聯繫紀錄</div>${isMgr?`<button class="btn btn-ghost btn-xs" onclick="alert('新增聯繫紀錄')">＋ 新增</button>`:''}</div>
        <div class="sc-body">
          <div class="contact-log">
            <div class="contact-entry done">
              <div>
                <div class="contact-label">第一次聯繫</div>
                <div class="contact-meta">2026/06/10 10:30・電話</div>
                <div class="contact-note">告知注意事項、入院日期及床位，家屬表示了解並同意入院。</div>
              </div>
            </div>
            <div class="contact-entry done">
              <div style="flex:1">
                <div class="contact-label">第二次聯繫（W4W5 確認）</div>
                <div class="contact-meta">2026/06/17 14:00・電話</div>
                <div class="contact-note">確認入院計畫，家屬已確認，無異動。</div>
              </div>
              ${isMgr&&!isFormal?`<div style="display:flex;gap:6px;flex-shrink:0;align-self:center">
                <button class="btn btn-green btn-xs" onclick="confirmArrival('${c.id}')">✓ 個案確定報到</button>
                <button class="btn btn-danger btn-xs" onclick="openNoShowArchive()">✕ 確定不報到</button>
              </div>`:''}
            </div>
          </div>
          ${c.modeType==='hosp'?`
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100)">
            <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">住院房型偏好（與排床模組同步）</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['無偏好','單人房','雙人房','多人房（3人以上）'].map(opt=>{
                const prefMap={'single':'單人房','double':'雙人房','multi':'多人房（3人以上）'};
                const currentPref=prefMap[c.roomPref]||'無偏好';
                const isSelected=opt===currentPref;
                return `<button class="btn ${isSelected?'btn-primary':'btn-secondary'} btn-xs" ${isAdm?'disabled':''} onclick="${isMgr?`alert('房型偏好已更新為「${opt}」，已同步至排床模組')`:''}">
                  ${isSelected?'✓ ':''} ${opt}
                </button>`;
              }).join('')}
            </div>
            ${c.roomPref&&c.roomPref!==null?`<div style="font-size:11px;color:var(--blue);margin-top:6px">目前偏好已同步至排床模組，安排床位時將優先配對</div>`:''}
          </div>
          `:''}
        </div>
      </div>

      <!-- 上游聯繫紀錄 -->
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">🏥 上游聯繫紀錄</div>${isMgr?`<button class="btn btn-ghost btn-xs" onclick="openUpstreamContactModal()">＋ 新增</button>`:''}</div>
        <div class="sc-body">
          <div class="info-grid-2" style="margin-bottom:12px">
            <div class="info-item"><label>上游醫院</label><span>${c.source}</span></div>
            <div class="info-item"><label>轉介窗口</label><span>${c.upstreamContact?.name||'—'}</span></div>
            <div class="info-item"><label>聯絡電話 / Line</label><span>${c.upstreamContact?.phone||'—'} ／ ${c.upstreamContact?.line||'—'}</span></div>
            <div class="info-item">
              <label>聯繫狀態</label>
              <span style="color:${c.upstreamStatus==='已回報收案'?'var(--green)':c.upstreamStatus==='已回報退案'?'var(--red)':'var(--gray-500)'};font-weight:600">
                ${c.upstreamStatus==='已回報收案'?'✓ 已回報收案':c.upstreamStatus==='已回報退案'?'✕ 已回報退案':'尚未回報'}
              </span>
            </div>
          </div>
          ${c.upstreamLog&&c.upstreamLog.length?`
          <div style="padding-top:12px;border-top:1px solid var(--gray-100)">
            <div class="contact-log">
              ${[...c.upstreamLog].reverse().map(log=>`
                <div class="contact-entry ${log.result==='已回報退案'?'':'done'}">
                  <div>
                    <div class="contact-label">${log.result||'已聯繫，尚無結果'}</div>
                    <div class="contact-meta">${log.datetime}・${log.method}</div>
                    ${log.openDate?`<div class="contact-note">預計開案日：${log.openDate}</div>`:''}
                    ${log.note?`<div class="contact-note">${log.note}</div>`:''}
                  </div>
                </div>`).join('')}
            </div>
          </div>
          `:`<div style="font-size:12px;color:var(--gray-400);padding-top:8px;border-top:1px solid var(--gray-100)">尚無聯繫紀錄，點擊「＋ 新增」開始記錄</div>`}
        </div>
      </div>
    </div>

    <!-- 收案流程（僅臨時病歷・居家個案顯示；住院／日照收案流程已整合進 PAC 收案判斷送出動作，Tab 已移除）-->
    ${!isFormal&&c.modeType==='home'?`
    <div class="detail-tab-panel" data-tab-key="flow" style="${tabPanelStyle('flow')}">
      ${renderModeFlowBlock(c,isMgr,isDoc)}
    </div>
    `:''}

    <!-- 病摘：病摘卡片（含住院診斷／出院診斷／病史欄位與附件） -->
    <div class="detail-tab-panel" data-tab-key="summary" style="${tabPanelStyle('summary')}">
      <!-- 病摘 -->
      <div class="section-card">
        <div class="sc-header">
          <div class="sc-title">📄 病摘</div>
          ${isMgr?`<div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-xs" onclick="openModal('modal-translate')">輔助翻譯</button>
            ${!isFormal?`<button class="btn btn-ghost btn-xs" onclick="toggleSummaryEdit('${caseId}')">${summaryEditMode?'💾 儲存':'✏️ 編輯'}</button>`:''}
          </div>`:''}
        </div>
        <div class="sc-body">
          <div class="form-row" style="margin-bottom:12px">
            <div class="form-group"><label>住院診斷</label><textarea class="form-control" id="summary-admission-dx" rows="2" ${(isMgr&&!isFormal&&summaryEditMode)?'':'readonly'}>${c.admissionDiagnosis||''}</textarea></div>
            <div class="form-group"><label>出院診斷</label><textarea class="form-control" id="summary-discharge-dx" rows="2" ${(isMgr&&!isFormal&&summaryEditMode)?'':'readonly'}>${c.dischargeDiagnosis||''}</textarea></div>
          </div>
          <div class="form-group full" style="margin-bottom:14px"><label>病史</label><textarea class="form-control" id="summary-medical-history" rows="2" ${(isMgr&&!isFormal&&summaryEditMode)?'':'readonly'}>${c.medicalHistory||''}</textarea></div>
          <div style="font-size:11px;color:var(--gray-400);margin-bottom:8px">附件檔案</div>
          <div class="attachment-list" style="margin-bottom:10px">
            <div class="attachment-item">
              <span class="attachment-icon">📄</span>
              <div style="flex:1"><div class="attachment-name">病摘原文.pdf</div><div class="attachment-meta">2.3 MB・2026/06/10 上傳</div></div>
              <button class="btn btn-ghost btn-xs" onclick="alert('預覽附件：病摘原文.pdf')">預覽</button>
            </div>
            <div class="attachment-item">
              <span class="attachment-icon">🎬</span>
              <div style="flex:1"><div class="attachment-name">家屬提供影片.mp4</div><div class="attachment-meta">15.8 MB・2026/06/11 上傳</div></div>
              <button class="btn btn-ghost btn-xs" onclick="alert('預覽附件：家屬提供影片.mp4')">預覽</button>
            </div>
          </div>
          ${(isDoc||isNur)?`<div style="font-size:11px;color:var(--gray-500);background:var(--gray-50);padding:8px 10px;border-radius:6px">此為個案病摘資料，僅供查閱，如需修改請聯繫負責個管師。</div>`:''}
          ${(isNur&&c.nurseNotified)?`<div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="confirmNurseReceived('${caseId}')">✓ 已確定接收</button></div>`:''}
          ${isMgr?`<div class="upload-zone" style="padding:14px" onclick="alert('選擇檔案上傳（PDF / Word / JPG / 影片）')"><div style="font-size:12px">📎 點擊或拖曳上傳附件（PDF / Word / JPG / 影片）</div></div>`:''}
        </div>
      </div>
    </div>

    <!-- PAC 收案判斷 -->
    <div class="detail-tab-panel" data-tab-key="judge" style="${tabPanelStyle('judge')}">
      ${judgeBlock}
    </div>

    <!-- 居家復健排班查看（正式病歷階段・僅居家個案；唯讀週視圖，同步自復健排班管理模組）-->
    ${isFormal&&c.modeType==='home'?`
    <div class="detail-tab-panel" data-tab-key="rehab" style="${tabPanelStyle('rehab')}">
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">📅 居家復健排班</div><span style="font-size:10px;color:var(--gray-400)">本週</span></div>
        <div class="sc-body">
          <div class="info-note blue" style="margin-bottom:12px">排班資料同步自復健排班管理模組，如需異動請至該模組操作</div>
          ${renderHomeRehabSchedule(c)}
        </div>
      </div>
    </div>
    `:''}

    <!-- 文件查看：轉診單（臨時與正式皆顯示）＋醫療紀錄查看＋相關表單（僅正式病歷階段）-->
    <div class="detail-tab-panel" data-tab-key="docs" style="${tabPanelStyle('docs')}">
      <!-- 轉診單（選填附件；臨時病歷階段可上傳，正式病歷階段唯讀查看） -->
      <div class="section-card">
        <div class="sc-header">
          <div class="sc-title">📋 轉診單</div>
          ${!isFormal?`<span style="font-size:10px;color:var(--gray-400)">選填</span>`:''}
        </div>
        <div class="sc-body">
          ${c.referralDoc?`
          <div class="attachment-list">
            <div class="attachment-item">
              <span class="attachment-icon">📄</span>
              <div style="flex:1"><div class="attachment-name">${c.referralDoc.name}</div><div class="attachment-meta">${c.referralDoc.size}・${c.referralDoc.date} 上傳</div></div>
              <button class="btn btn-ghost btn-xs" onclick="alert('預覽附件：${c.referralDoc.name}')">預覽</button>
            </div>
          </div>
          `:!isFormal&&isMgr?`
          <div class="upload-zone" style="padding:14px" onclick="alert('選擇檔案上傳（PDF / Word / JPG）')"><div style="font-size:12px">📎 點擊或拖曳上傳轉診單（PDF / Word / JPG）</div></div>
          `:`
          <div style="text-align:center;padding:16px;color:var(--gray-400);font-size:12px">未提供轉診單</div>
          `}
        </div>
      </div>

      ${isFormal?`
      <!-- 醫療紀錄查看（僅住院個案）-->
      ${c.modeType==='hosp'?`
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">🩺 醫療紀錄查看</div><span style="font-size:10px;color:var(--gray-400)">僅限住院個案</span></div>
        <div class="sc-body">
          <div class="forms-grid">
            <div class="form-item" onclick="alert('將串接杏翔系統查看護理紀錄')">
              <div class="form-item-left"><div class="form-icon">📋</div><div><div class="form-name">護理紀錄</div><div class="form-meta">*杏翔</div></div></div>
              <span class="form-status fs-pending">查看</span>
            </div>
            <div class="form-item" onclick="alert('將串接杏翔系統查看病程記錄')">
              <div class="form-item-left"><div class="form-icon">📈</div><div><div class="form-name">病程記錄</div><div class="form-meta">*杏翔</div></div></div>
              <span class="form-status fs-pending">查看</span>
            </div>
            <div class="form-item" onclick="alert('將串接杏翔系統查看生命徵象')">
              <div class="form-item-left"><div class="form-icon">💓</div><div><div class="form-name">生命徵象</div><div class="form-meta">*杏翔</div></div></div>
              <span class="form-status fs-pending">查看</span>
            </div>
            <div class="form-item" onclick="renderPage('his-record','${caseId}')">
              <div class="form-item-left"><div class="form-icon">🏥</div><div><div class="form-name">正式病歷</div><div class="form-meta">*杏翔</div></div></div>
              <span class="form-status fs-pending">查看</span>
            </div>
          </div>
        </div>
      </div>
      `:''}

      <!-- 醫療紀錄查看（僅日照／居家個案，僅含正式病歷入口）-->
      ${(c.modeType==='day'||c.modeType==='home')?`
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">🩺 醫療紀錄查看</div><span style="font-size:11px;color:var(--gray-400)">僅限正式病歷個案</span></div>
        <div class="sc-body">
          <div class="forms-grid">
            <div class="form-item" onclick="renderPage('his-record','${caseId}')">
              <div class="form-item-left"><div class="form-icon">🏥</div><div><div class="form-name">正式病歷</div><div class="form-meta">*杏翔</div></div></div>
              <span class="form-status fs-pending">查看</span>
            </div>
          </div>
        </div>
      </div>
      `:''}

      <!-- 相關表單 -->
      <div class="section-card">
        <div class="sc-header"><div class="sc-title">📑 相關表單</div></div>
        <div class="sc-body">
          ${formsList(formData.common,'在院期間表單')}
          ${formData.post.length?`<div class="divider"></div>${formsList(formData.post,'結案後表單')}`:''}
        </div>
      </div>
      `:''}
    </div>

    <!-- 轉介：轉介安排（僅正式病歷階段常駐顯示，不限即將結案才出現；封存後轉為唯讀查看）-->
    ${isFormal?`
    <div class="detail-tab-panel" data-tab-key="referral" style="${tabPanelStyle('referral')}">
      ${c.referral?(()=>{
        const referralReadonly=(!isMgr)||c.status==='封存';
        return `
      <div class="section-card">
        <div class="sc-header">
          <div class="sc-title">🔄 轉介安排</div>
          <span class="badge ${c.referral.status==='已轉介'?'badge-green':c.referral.status==='轉介中'?'badge-amber':'badge-gray'}">${c.referral.status}</span>
        </div>
        <div class="sc-body">
          <div style="font-size:11px;color:var(--gray-400);margin-bottom:10px">個管師可隨時安排轉介，不限結案前才處理。常見轉介去向：居家醫療／長照／社工。</div>
          <div class="form-group" style="margin-bottom:10px">
            <label>轉介去向</label>
            <select class="form-control" id="referral-target-select" ${referralReadonly?'disabled':''}>
              <option ${c.referral.status==='待轉介'?'selected':''}>無需轉介</option>
              <option>轉介居家醫療</option><option>轉介長照服務</option><option>轉介社工服務</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label>轉介備註</label>
            <textarea class="form-control" id="referral-note" rows="2" ${referralReadonly?'readonly':''} placeholder="轉介服務說明、聯絡窗口等…">${c.referral.note||''}</textarea>
          </div>
          <div class="form-group">
            <label>預估出院動向</label>
            ${!referralReadonly?`<select class="form-control" onchange="updateDischargeDest('${caseId}',this.value)">${DISCHARGE_DEST_OPTIONS.map(o=>`<option value="${o}" ${c.dischargeDest===o?'selected':''}>${o||'請選擇'}</option>`).join('')}</select>`:`<input class="form-control" value="${c.dischargeDest||'—'}" readonly>`}
          </div>
          ${c.dischargeDest==='其他'?`<div class="form-group" style="margin-top:10px">
            <label>其他說明${!referralReadonly?' <span class="required">*</span>':''}</label>
            ${!referralReadonly?`<input class="form-control" value="${c.dischargeDestNote||''}" oninput="updateDischargeDestNote(this.value)" placeholder="請說明出院後去向">`:`<input class="form-control" value="${c.dischargeDestNote||'—'}" readonly>`}
          </div>`:''}
          ${!referralReadonly?`<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="saveReferral('${c.id}')">儲存</button></div>`:''}
        </div>
      </div>
      `;})():''}
    </div>
    `:''}
  `;
}

// ── 個案詳情頁 Tab 切換：僅顯示/隱藏對應區塊，不重新呼叫 renderDetail，避免破壞其他互動狀態 ──
function switchDetailTab(tabKey){
  detailActiveTab=tabKey;
  document.querySelectorAll('.detail-tab-panel').forEach(el=>{
    el.style.display = el.dataset.tabKey===tabKey ? '' : 'none';
  });
  document.querySelectorAll('.detail-tabs .tab').forEach(el=>{
    el.classList.toggle('active', el.dataset.tabKey===tabKey);
  });
}

// ── 動態組裝時間軸 ──
// 臨時病歷階段：共用3節點 + 依模式分岔節點；轉正式後接上正式階段共用節點
// 回傳節點陣列，每個節點含 label / sub / event(是否為紅標關鍵分岔節點，依參考圖統一用主題藍色強調) / done / active
function buildTimeline(c){
  const modeKey=c.modeType||'hosp';
  const tempNodes=[
    ...TIMELINE_TEMP_COMMON.map(label=>({label})),
    ...(TIMELINE_TEMP_BY_MODE[modeKey]||TIMELINE_TEMP_BY_MODE.hosp)
  ];
  const formalNodes=TIMELINE_FORMAL_COMMON.map(n=>({...n}));
  // 正式病歷階段：時間軸只從「照護中」開始畫，不顯示臨時病歷階段節點
  const allNodes=c.formal?formalNodes:tempNodes;

  // 找出目前所在節點的 index（依 c.timelineStep + c.timelineSub 比對 label/sub）
  let currentIdx=-1;
  if(c.timelineStep){
    currentIdx=allNodes.findIndex(n=>{
      if(n.label!==c.timelineStep) return false;
      if(c.timelineSub) return n.sub===c.timelineSub || (n.sub&&n.sub.includes(c.timelineSub));
      return true;
    });
    // 找不到精確匹配時，退而求其次比對 label
    if(currentIdx===-1) currentIdx=allNodes.findIndex(n=>n.label===c.timelineStep);
  }
  // 若曾經展延失敗過，補上"展延結果"節點視為已完成（用於照護中展延後情境）
  if(c.hadExtensionFail&&currentIdx===-1){
    currentIdx=allNodes.findIndex(n=>n.label==='照護中'&&n.sub==='展延後');
  }
  return allNodes.map((n,i)=>({
    label:n.label,
    sub:n.sub||'',
    event:!!n.event,
    done:currentIdx>=0&&i<currentIdx,
    active:i===currentIdx,
  }));
}

function judgeOption(label,selected,disabled){
  return `<div class="judge-option ${selected?'selected':''} ${disabled?'':''}" style="${disabled?'cursor:default;opacity:.85':''}" onclick="${disabled?'':`this.parentElement.querySelectorAll('.judge-option').forEach(el=>el.classList.remove('selected'));this.classList.add('selected')`}">
    <input type="radio" name="judge-result" ${selected?'checked':''} ${disabled?'disabled':''}><span>${label}</span>
  </div>`;
}

function submitPacJudgment(caseId){
  const selected=document.querySelector('input[name="judge-result"]:checked');
  const result=selected?selected.nextElementSibling.textContent:'是 PAC';
  const c=getCurrentCaseObj();
  const judgedBySel=document.getElementById('pac-judged-by');
  if(c&&judgedBySel) c.judgedBy=judgedBySel.value;
  if(result==='是 PAC'){
    const categorySel=document.getElementById('pac-disease-category');
    if(!categorySel||!categorySel.value){alert('請選擇 PAC 疾病別分類');return;}
    if(c) c.diseaseCategory=categorySel.value;
    if(c&&c.modeType==='hosp'){
      openCollectionConfirmModal(caseId,'hosp');
    } else if(c&&c.modeType==='day'){
      openCollectionConfirmModal(caseId,'day');
    } else {
      alert('判斷結果：是 PAC\n\n請至下方「居家收案流程」完成①交付復健主管居家報名，待復健主管確認可承接、醫師到宅評估後，才會進入「確認收案」。');
      renderPage('detail',currentCase);
    }
  } else if(result==='非 PAC'){
    openModal('modal-nonpac-step1');
  } else {
    alert('判斷結果：需再評估\n\n狀態維持不變，已記錄本次判斷意見供後續參考');
  }
}

// ── 居家復健排班：週次計算（依開案日＆預估結案日推算總週數，第1週起算於開案日當週的週一）──
function getHomeRehabTotalWeeks(c){
  if(!c.openDate||!c.closeDate||c.closeDate==='—') return 1;
  const open=new Date(c.openDate.replace(/\//g,'-'));
  const close=new Date(c.closeDate.replace(/\//g,'-'));
  const diffDays=Math.round((close-open)/(24*3600*1000));
  if(isNaN(diffDays)) return 1;
  return Math.max(1,Math.ceil((diffDays+1)/7));
}
function getHomeRehabWeekMonday(c,weekIndex){
  const open=new Date(c.openDate.replace(/\//g,'-'));
  const openDow=(open.getDay()+6)%7; // 轉換為 0=一...6=日
  const week1Monday=new Date(open);
  week1Monday.setDate(open.getDate()-openDow);
  const monday=new Date(week1Monday);
  monday.setDate(week1Monday.getDate()+(weekIndex-1)*7);
  return monday;
}
function fmtRehabDate(d,withDow){
  const base=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  if(!withDow) return base;
  const dowChar=['一','二','三','四','五','六','日'][(d.getDay()+6)%7];
  return `${base}（${dowChar}）`;
}
function switchRehabWeek(caseId,weekIndex){
  rehabWeekIndex=parseInt(weekIndex,10)||1;
  rehabWeekCaseId=caseId;
  renderPage('detail',currentCase);
}

// ── 居家復健排班（唯讀週視圖，可切換週次）：初評／複評／結案評估以不同顏色標籤與一般例行治療區隔 ──
function renderHomeRehabSchedule(c){
  const schedule=c.homeRehabSchedule;
  if(!schedule||!schedule.length){
    return `<div style="text-align:center;padding:30px 16px;color:var(--gray-400);font-size:12px">尚無排班資料</div>`;
  }
  const totalWeeks=getHomeRehabTotalWeeks(c);
  if(rehabWeekCaseId!==c.id){ rehabWeekIndex=1; rehabWeekCaseId=c.id; }
  if(rehabWeekIndex<1) rehabWeekIndex=1;
  if(rehabWeekIndex>totalWeeks) rehabWeekIndex=totalWeeks;
  const midWeek=Math.min(totalWeeks,Math.max(1,Math.ceil(totalWeeks/2)));
  const monday=getHomeRehabWeekMonday(c,rehabWeekIndex);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);

  const profStyle={PT:{color:'var(--blue)',bg:'var(--blue-light)'},OT:{color:'#9D174D',bg:'#FCE7F3'},ST:{color:'var(--green)',bg:'var(--green-light)'}};
  const tagBadge={'初評':'badge-blue','複評':'badge-purple','結案評估':'badge-amber'};
  const dowLabel=['一','二','三','四','五','六','日'];

  const byDow={};
  schedule.forEach(item=>{ (byDow[item.dow]=byDow[item.dow]||[]).push(item); });

  const today=new Date('2026-07-17'); // prototype 假設今日，用於標示「今天」欄位
  const todayKey=fmtRehabDate(today);

  const dayCells=dowLabel.map((label,dow)=>{
    const d=new Date(monday); d.setDate(monday.getDate()+dow);
    const isWeekend=dow>=5;
    const isToday=fmtRehabDate(d)===todayKey;
    const items=byDow[dow]||[];
    const eventCards=items.map(item=>{
      const showTag=item.tag&&(
        (item.tag==='初評'&&rehabWeekIndex===1)||
        (item.tag==='複評'&&rehabWeekIndex===midWeek)||
        (item.tag==='結案評估'&&rehabWeekIndex===totalWeeks)
      );
      const ps=profStyle[item.profession]||profStyle.PT;
      return `
      <div style="padding:6px 7px;border-radius:6px;background:${showTag?'var(--purple-light)':ps.bg};border:1px solid ${showTag?'#DDD6FE':'transparent'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px">
          <span style="font-size:10px;font-weight:700;color:${ps.color}">${item.profession}</span>
          ${showTag?`<span class="badge ${tagBadge[item.tag]||'badge-purple'}" style="font-size:9px;padding:1px 5px">${item.tag}</span>`:''}
        </div>
        <div style="font-size:10px;font-weight:600;color:var(--gray-700)">${item.period}</div>
        <div style="font-size:9px;color:var(--gray-400)">${item.timeRange}</div>
        <div style="font-size:10px;color:var(--gray-600);margin-top:3px">${item.therapist}・${item.duration}</div>
      </div>`;
    }).join('');
    return `
    <div style="border:1px solid ${isToday?'var(--blue)':'var(--gray-200)'};border-radius:8px;min-height:118px;background:${isWeekend?'var(--gray-50)':'var(--white)'};display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:6px 8px;border-bottom:1px solid var(--gray-100);text-align:center;background:${isToday?'var(--blue-light)':'transparent'}">
        <div style="font-size:10px;color:${isToday?'var(--blue)':'var(--gray-400)'};font-weight:600">週${label}</div>
        <div style="font-size:13px;font-weight:700;color:${isToday?'var(--blue)':'var(--gray-800)'}">${d.getDate()}</div>
      </div>
      <div style="flex:1;padding:5px;display:flex;flex-direction:column;gap:4px">
        ${eventCards||`<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--gray-300)">－</div>`}
      </div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--gray-500)">${fmtRehabDate(monday)} － ${fmtRehabDate(sunday)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn btn-ghost btn-xs" ${rehabWeekIndex<=1?'disabled':''} onclick="switchRehabWeek('${c.id}',${rehabWeekIndex-1})">‹ 上一週</button>
        <select class="form-control" style="font-size:12px;padding:5px 8px;width:auto" onchange="switchRehabWeek('${c.id}',this.value)">
          ${Array.from({length:totalWeeks},(_,i)=>i+1).map(w=>`<option value="${w}" ${w===rehabWeekIndex?'selected':''}>第 ${w} 週</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-xs" ${rehabWeekIndex>=totalWeeks?'disabled':''} onclick="switchRehabWeek('${c.id}',${rehabWeekIndex+1})">下一週 ›</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;min-width:700px">${dayCells}</div>
    </div>
  `;
}

function renderModeFlowBlock(c,isMgr,isDoc){
  // 住院／日照收案流程已整合進「PAC 收案判斷」送出動作（見 submitPacJudgment → openCollectionConfirmModal），此處不再顯示對應卡片
  if(c.modeType==='home'){
    const stage=c.status; // 待補件/收案判斷中 → 待評估(待復健評估) → 待評估(待醫師評估) → 確認收案 → 待聯絡 → 待開案
    const step1Delivered=c.timelineSub==='待復健評估'||c.timelineSub==='待醫師評估';
    const step3Unlocked=c.timelineSub==='待醫師評估';

    const step1Html=step1Delivered?`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
        <div style="font-size:12px"><strong>① 交付復健主管居家報名</strong><div style="font-size:11px;color:var(--green);margin-top:2px;font-weight:600">✓ 已交付復健主管，等待回覆</div></div>
      </div>`:`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
        <div style="font-size:12px"><strong>① 交付復健主管居家報名</strong><div style="font-size:11px;color:var(--gray-400);margin-top:2px">傳送時間／個案基本資料／病摘／住址給復健主管</div></div>
        ${isMgr?`<button class="btn btn-secondary btn-xs" onclick="openHomeStep1DeliverModal('${c.id}')">交付</button>`:''}
      </div>`;

    let step2Html;
    // 來源標籤：目前僅有個管師代填一種路徑；rehabReportBy==='rehab'（復健主管本人回報）為未來擴充，尚未串接
    const rehabSourceBadge=(c.rehabReportBy==='rehab'
      ?''
      :'<span class="badge badge-gray" style="margin-left:6px">🔖 個管師代填</span>')
      +(isMgr?`<a href="javascript:void(0)" style="font-size:10px;color:var(--gray-400);text-decoration:none;cursor:pointer;margin-left:6px" onclick="editRehabReport('${c.id}')">✏️ 修改</a>`:'');
    if(c.rehabReport==='可承接'){
      step2Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--blue-mid);border-radius:7px;background:var(--blue-light)">
        <div style="font-size:12px"><strong>② 確認復健受理</strong><div style="font-size:11px;color:var(--blue);margin-top:2px;font-weight:600">✓ 復健主管已回覆：可承接${rehabSourceBadge}</div></div>
        ${isMgr?`<button class="btn btn-secondary btn-xs" onclick="confirmRehabAccepted('${c.id}')">確認復健受理</button>`:''}
      </div>`;
    } else if(c.rehabReport==='無法承接'){
      step2Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #FECACA;border-radius:7px;background:var(--red-light)">
        <div style="font-size:12px"><strong>② 確認復健受理</strong><div style="font-size:11px;color:var(--red);margin-top:2px;font-weight:600">✕ 復健主管已回覆：無法承接（量能不足）${rehabSourceBadge}</div></div>
        ${isMgr?`<button class="btn btn-danger btn-xs" onclick="openArchiveModal({formal:false,presetType:'居家不收治',locked:true})">封存</button>`:''}
      </div>`;
    } else {
      step2Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
        <div style="font-size:12px"><strong>② 確認復健受理</strong>
          <div style="font-size:11px;color:var(--gray-400);margin-top:2px">復健主管回報承接後，個管師點選確認記錄（不影響主要時間軸節點）</div>
          <div style="font-size:10px;color:var(--gray-400);margin-top:2px">＊復健主管本人回報功能將於居家排班管理模組上線，此處暫由個管師代為登記</div>
        </div>
        ${isMgr?`<div style="display:flex;gap:6px"><button class="btn btn-secondary btn-xs" onclick="registerRehabReport('${c.id}','可承接')">登記回覆：可承接</button><button class="btn btn-danger btn-xs" onclick="registerRehabReport('${c.id}','無法承接')">登記回覆：無法承接</button></div>`:''}
      </div>`;
    }

    const step3Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
        <div style="font-size:12px"><strong>③ 轉交醫師居家評估</strong><div style="font-size:11px;color:var(--gray-400);margin-top:2px">通知醫師安排居家首次訪視，二次確認 PAC 資格</div></div>
        ${step3Unlocked
          ?(isMgr?`<button class="btn btn-secondary btn-xs" onclick="alert('已通知醫師安排居家評估')">轉交醫師</button>`:'')
          :`<span style="font-size:11px;color:var(--gray-400)">需完成步驟②復健受理確認後解鎖</span>`}
      </div>`;

    let step4Html;
    // 來源標示：mgr 代填顯示確認方式；doctor 本人回報或欄位不存在（既有假資料）一律視為醫師本人回報
    const doctorSourceBadge=(c.doctorReportBy==='mgr'
      ?`<span class="badge badge-gray" style="margin-left:6px">🔖 個管師代填（${c.doctorReportNote||''}）</span>`
      :`<span style="font-size:10px;color:var(--gray-400);font-weight:400;margin-left:6px">・醫師本人回報</span>`)
      +((isMgr||isDoc)?`<a href="javascript:void(0)" style="font-size:10px;color:var(--gray-400);text-decoration:none;cursor:pointer;margin-left:6px" onclick="editDoctorReport('${c.id}')">✏️ 修改</a>`:'');
    if(c.doctorReport==='pac'){
      step4Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--green-mid);border-radius:7px;background:var(--green-light)">
        <div style="font-size:12px"><strong>④ 醫師居家評估回報</strong><div style="font-size:11px;color:var(--green);margin-top:2px;font-weight:600">✓ 醫師已回報：符合 PAC 資格${doctorSourceBadge}</div></div>
        ${isMgr?`<button class="btn btn-green btn-xs" onclick="openCollectionConfirmModal('${c.id}','homePac')">確認收案</button>`:''}
      </div>`;
    } else if(c.doctorReport==='nonpac'){
      step4Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid #FECACA;border-radius:7px;background:var(--red-light)">
        <div style="font-size:12px"><strong>④ 醫師居家評估回報</strong><div style="font-size:11px;color:var(--red);margin-top:2px;font-weight:600">✕ 醫師已回報：不符合 PAC 資格${doctorSourceBadge}</div></div>
        ${isMgr?`<button class="btn btn-danger btn-xs" onclick="openArchiveModal({formal:false,presetType:'轉居家醫療（非PAC）',locked:true})">封存</button>`:''}
      </div>`;
    } else if(step3Unlocked){
      // 個管師已完成③轉交醫師，直接進入待回報狀態，不再有「接收」中間過渡畫面
      step4Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--blue-mid);border-radius:7px;background:var(--blue-light)">
        <div style="font-size:12px"><strong>④ 醫師居家評估回報</strong><div style="font-size:11px;color:var(--blue);margin-top:2px;font-weight:600">待您完成回報</div></div>
        ${isDoc
          ?`<div style="display:flex;gap:6px"><button class="btn btn-green btn-xs" onclick="doctorReportHomeVisit('${c.id}','pac')">✓ 回報：符合 PAC 資格</button><button class="btn btn-danger btn-xs" onclick="doctorReportHomeVisit('${c.id}','nonpac')">✕ 回報：不符合 PAC 資格</button></div>`
          :(isMgr
            ?`<div style="text-align:right"><div style="font-size:11px;color:var(--gray-400)">等待醫師回報結果</div><a href="javascript:void(0)" style="font-size:11px;color:var(--blue);text-decoration:none;cursor:pointer" onclick="openDoctorReportByMgrModal('${c.id}')">📞 醫師電話告知結果？點此代為登記</a></div>`
            :`<span style="font-size:11px;color:var(--gray-400)">等待醫師回報結果</span>`)}
      </div>`;
    } else {
      step4Html=`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
        <div style="font-size:12px"><strong>④ 醫師居家評估回報</strong></div>
        <span style="font-size:11px;color:var(--gray-400)">等待醫師回報中</span>
      </div>`;
    }
    return `
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">🏡 居家收案流程</div><span class="badge badge-amber">${stage}</span></div>
      <div class="sc-body">
        <div style="display:flex;flex-direction:column;gap:8px">
          ${step1Html}
          ${step2Html}
          ${step3Html}
          ${step4Html}
        </div>
      </div>
    </div>`;
  }
  return '';
}

function renderFormFill(container,caseId,formName){
  currentForm=formName;
  const allCases=[...CASES.temp,...CASES.formal];
  const c=allCases.find(x=>x.id===caseId)||CASES.formal[0];
  document.getElementById('bc').textContent=`個案管理 › ${c.name} › ${formName}`;

  const fillData=FORM_FILL_CONTENT[formName];
  const isMgr=currentRole==='mgr';

  let sectionsHTML='';
  if(fillData){
    sectionsHTML=fillData.sections.map(sec=>{
      if(sec.table){
        return `<div class="form-section">
          <div class="fs-header"><div class="fs-title">${sec.title}</div></div>
          <div class="fs-body" style="padding:0">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:var(--gray-50)">
                <th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">次別</th>
                <th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">日期</th>
                <th style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">病程週數</th>
                <th style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">PT</th>
                <th style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">OT</th>
                <th style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">ST</th>
                <th style="padding:8px 12px;border-bottom:1px solid var(--gray-200);font-size:11px;color:var(--gray-500)">狀態</th>
              </tr></thead>
              <tbody>
                ${sec.rows.map((r,i)=>`<tr style="${i===1?'background:var(--blue-light)':''} ${r.status==='future'?'opacity:.5':''}">
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100);font-weight:600">${r.label}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100)">${r.date}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100);text-align:center">${r.week}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100);color:var(--blue);font-weight:600">${r.pt}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100);color:#9D174D;font-weight:600">${r.ot}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100);color:var(--green);font-weight:600">${r.st}</td>
                  <td style="padding:9px 12px;border-bottom:1px solid var(--gray-100)">
                    ${r.status==='done'?'<span class="badge badge-green">✓ 完成</span>':r.status==='pending'?'<span class="badge badge-amber">待填</span>':'<span class="badge badge-gray">未到期</span>'}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      }
      if(sec.checklist){
        return `<div class="form-section">
          <div class="fs-header"><div class="fs-title">${sec.title}</div></div>
          <div class="fs-body">
            <div class="checklist">
              ${sec.items.map(item=>`<div class="check-item"><input type="checkbox"><span>${item}</span></div>`).join('')}
            </div>
          </div>
        </div>`;
      }
      const fieldsHTML=sec.fields.map(f=>{
        if(f.type==='textarea') return `<div class="form-group full"><label>${f.label}</label><textarea class="form-control" rows="3" ${f.readonly?'readonly':''}>${f.value||''}</textarea></div>`;
        if(f.type==='select') return `<div class="form-group"><label>${f.label}</label><select class="form-control" ${f.readonly?'disabled':''}>${(f.options||[]).map(o=>`<option ${o===f.value?'selected':''}>${o}</option>`).join('')}</select></div>`;
        return `<div class="form-group"><label>${f.label}</label><input class="form-control" type="text" value="${f.value||''}" ${f.readonly?'readonly':''}></div>`;
      }).join('');
      return `<div class="form-section">
        <div class="fs-header"><div class="fs-title">${sec.title}</div></div>
        <div class="fs-body"><div class="form-row">${fieldsHTML}</div></div>
      </div>`;
    }).join('');
  } else {
    // 沒有預設內容的表單：顯示通用框架
    sectionsHTML=`
      <div class="form-section">
        <div class="fs-header"><div class="fs-title">基本資料（自動帶入）</div></div>
        <div class="fs-body">
          <div class="form-row">
            <div class="form-group"><label>個案姓名</label><input class="form-control" value="${c.name}" readonly></div>
            <div class="form-group"><label>病歷號</label><input class="form-control" value="${c.formal?'00073450':'—'}" readonly></div>
            <div class="form-group"><label>照護模式</label><input class="form-control" value="${c.mode}" readonly></div>
            <div class="form-group"><label>記錄日期</label><input class="form-control" type="date" value="2026-06-25"></div>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="fs-header"><div class="fs-title">填寫內容</div></div>
        <div class="fs-body">
          <div class="info-note blue">此表單內容依實際使用情境填寫，欄位設計將依業務需求細化。</div>
          <div class="form-group full"><label>主要內容</label><textarea class="form-control" rows="5" placeholder="填寫${formName}相關內容..."></textarea></div>
          <div class="form-group full"><label>備註</label><textarea class="form-control" rows="2" placeholder="其他備註..."></textarea></div>
        </div>
      </div>
    `;
  }

  container.innerHTML=`
    <div class="back-link" onclick="renderPage('detail','${caseId}')">← 返回 ${c.name} 個案詳情</div>

    <div class="form-fill-header">
      <div>
        <div class="ff-title">${formName}</div>
        <div class="ff-meta">${c.name}・${c.mode}・${c.disease}・2026/06/25</div>
      </div>
      <div class="ff-actions">
        <button class="btn btn-secondary btn-sm" onclick="alert('已列印')">🖨️ 列印</button>
        <button class="btn btn-secondary btn-sm" onclick="alert('已預覽')">👁 預覽</button>
        <button class="btn btn-secondary btn-sm" onclick="alert('已暫存')">暫存</button>
        ${isMgr||currentRole==='doc'||currentRole==='nur'?`<button class="btn btn-primary btn-sm" onclick="alert('表單已送出')">送出</button>`:''}
      </div>
    </div>

    ${sectionsHTML}

    <div class="form-footer">
      <div style="font-size:11px;color:var(--gray-500)">最後儲存：2026/06/25 14:30・林美惠</div>
      <div style="display:flex;gap:7px">
        <button class="btn btn-secondary btn-sm" onclick="alert('已暫存')">暫存</button>
        ${isMgr||currentRole==='doc'||currentRole==='nur'?`<button class="btn btn-primary btn-sm" onclick="alert('表單已送出')">送出</button>`:''}
      </div>
    </div>
  `;
}

// ── 正式病歷（杏翔）唯讀詳情頁：由醫療紀錄查看 section 的「正式病歷」卡片點擊進入 ──
function renderHisRecord(container,caseId){
  currentCase=caseId;
  const allCases=[...CASES.temp,...CASES.formal];
  const c=allCases.find(x=>x.id===caseId)||CASES.formal[0];
  document.getElementById('bc').textContent=`個案管理 › ${c.name} › 正式病歷（杏翔）`;

  const isHosp=c.modeType==='hosp';
  const dateLabel1=isHosp?'入院日期':'開案日期';
  const dateLabel2=isHosp?'預計出院日期':'結案日期';

  container.innerHTML=`
    <div class="back-link" onclick="renderPage('detail','${caseId}')">← 返回 ${c.name} 個案詳情</div>

    <div class="form-fill-header">
      <div>
        <div class="ff-title">正式病歷（杏翔）</div>
        <div class="ff-meta">${c.name}・${c.mode}・${c.disease}・${c.openDate||'—'}</div>
      </div>
      <div style="font-size:11px;color:var(--gray-400)">由杏翔系統同步・如需修改請至杏翔操作</div>
    </div>

    <div class="form-section">
      <div class="fs-header"><div class="fs-title">基本資料</div></div>
      <div class="fs-body">
        <div class="form-row">
          <div class="form-group"><label>姓名</label><input class="form-control" value="${c.name}" readonly></div>
          <div class="form-group"><label>性別</label><input class="form-control" value="男" readonly></div>
          <div class="form-group"><label>血型</label><input class="form-control" value="A 型" readonly></div>
          <div class="form-group"><label>生日</label><input class="form-control" value="${c.birthDate||'—'}" readonly></div>
          <div class="form-group"><label>科別</label><input class="form-control" value="${c.department||'—'}" readonly></div>
          <div class="form-group"><label>主治醫師</label><input class="form-control" value="張宗達 醫師" readonly></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="fs-header"><div class="fs-title">診斷</div></div>
      <div class="fs-body">
        <div class="form-row">
          <div class="form-group"><label>主診斷</label><input class="form-control" value="${c.disease}" readonly></div>
          <div class="form-group"><label>藥物過敏</label><input class="form-control" value="盤尼西林" readonly></div>
          <div class="form-group"><label>其他過敏</label><input class="form-control" value="無" readonly></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="fs-header"><div class="fs-title">住院資訊</div></div>
      <div class="fs-body">
        <div class="form-row">
          <div class="form-group"><label>${dateLabel1}</label><input class="form-control" value="${c.openDate||'—'}" readonly></div>
          <div class="form-group"><label>${dateLabel2}</label><input class="form-control" value="${c.closeDate||'—'}" readonly></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="fs-header"><div class="fs-title">病歷內容</div></div>
      <div class="fs-body">
        <div class="form-group full"><label>主訴</label><textarea class="form-control" rows="2" readonly>右側肢體無力合併言語不清，發病約 2 天</textarea></div>
        <div class="form-group full"><label>現在病歷</label><textarea class="form-control" rows="3" readonly>患者於發病當日由家屬送至急診，經影像學確認為左側大腦中動脈梗塞，已接受靜脈血栓溶解治療，病情穩定後轉介 PAC 復健療程。</textarea></div>
        <div class="form-group full"><label>過去病史</label><textarea class="form-control" rows="2" readonly>高血壓 10 年、第二型糖尿病 5 年</textarea></div>
        <div class="form-group full"><label>家族史</label><textarea class="form-control" rows="2" readonly>父親有高血壓病史</textarea></div>
        <div class="form-group full"><label>系統回顧</label><textarea class="form-control" rows="2" readonly>心血管系統：高血壓控制中；神經系統：右側偏癱、輕度失語</textarea></div>
      </div>
    </div>

    <div class="form-footer" style="justify-content:flex-end">
      <button class="btn btn-secondary btn-sm" onclick="renderPage('detail','${caseId}')">← 返回個案詳情</button>
    </div>
  `;
}

// ── 工具函式 ──
function switchModalTab(el,targetId){
  el.closest('.modal-body').querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['new-manual','new-ocr','new-his'].forEach(id=>{
    const el2=document.getElementById(id);
    if(el2) el2.classList.toggle('hidden',id!==targetId);
  });
}
function updateAgeDisplay(){
  const val=document.getElementById('new-birthdate').value;
  if(!val) return;
  const age=calcAge(val);
  document.getElementById('new-age-display').textContent=`年齡：${age}歲`;
}
function fillFrequentContact(idx){
  if(idx===''){
    document.getElementById('new-up-name').value='';
    document.getElementById('new-up-phone').value='';
    document.getElementById('new-up-line').value='';
    return;
  }
  const p=FREQUENT_UPSTREAM_CONTACTS[idx];
  document.getElementById('new-up-name').value=p.name;
  document.getElementById('new-up-phone').value=p.phone;
  document.getElementById('new-up-line').value=p.line;
}
function showHisResult(){
  document.getElementById('his-result').classList.remove('hidden');
}

// ── 新增個案：儲存前比對封存清單，姓名與出生日期皆相符才視為命中 ──
function getArchivedCases(){
  return [...CASES.temp,...CASES.formal].filter(c=>c.status==='封存');
}
function findArchivedCaseMatch(name,birthDate){
  return getArchivedCases().find(c=>c.name===name&&c.birthDate===birthDate)||null;
}
function saveNewCase(){
  const manualVisible=!document.getElementById('new-manual').classList.contains('hidden');
  const hisVisible=!document.getElementById('new-his').classList.contains('hidden');
  let name='',birthDate='',mgr='';
  if(manualVisible){
    name=(document.getElementById('new-manual-name').value||'').trim();
    const bd=document.getElementById('new-birthdate').value;
    birthDate=bd?bd.replace(/-/g,'/'):'';
    mgr=document.getElementById('new-mgr-select').value;
  } else if(hisVisible){
    name=(document.getElementById('his-name').value||'').trim();
    birthDate=(document.getElementById('his-birthdate').value||'').trim();
  }
  if(name&&birthDate){
    const match=findArchivedCaseMatch(name,birthDate);
    if(match){
      openArchiveMatchModal(match);
      return;
    }
  }
  finalizeSaveNewCase();
}
function finalizeSaveNewCase(){
  closeModal('modal-new');
  alert('臨時病歷已建立');
}
function openArchiveMatchModal(match){
  const age=match.birthDate?calcAge(match.birthDate):'—';
  const reasonPart=match.archiveReason?`；${match.archiveReason}`:'';
  document.getElementById('archive-match-text').textContent=
    `系統偵測到封存個案中有相符資料：姓名（${match.name}），${age}歲，${match.archiveDate||'—'} 封存，封存原因：${match.archiveType||'—'}${reasonPart} —— 是否要複製此筆基本資料？`;
  openModal('modal-archive-match');
}
function archiveMatchProceedNew(){
  closeModal('modal-archive-match');
  finalizeSaveNewCase();
}
function archiveMatchCopy(){
  closeModal('modal-archive-match');
  closeModal('modal-new');
  alert('請至封存 Tab 選擇個案，點擊「回復資料」即可帶入基本資料重新建立。');
}

function showLinkTip(formName,target){
  alert(`「${formName}」屬於${target}的功能範圍，將跳轉至 ${target} 查看／填寫。\n\n（prototype 示意，實際串接後將直接導向該模組對應頁面）`);
}

// ── 匯出展延／結案資料：依個案照護模式（住院／居家／日照）動態產生項目清單 ──
const EXPORT_EXTEND_ITEMS={
  base:['封面表單','總表（評估量表）','會議記錄','專審表'],
  hosp:['入院病摘','護理紀錄','病程記錄','生命徵象'],
  home:['PAC 居家復健治療紀錄','英文病歷'],
  day:['日照執行記錄表','英文病歷'],
};
const EXPORT_CLOSE_ITEMS={
  base:['PAC照護模式記錄表','病歷摘要','居家環境評估暨危險因子檢核表','個案綜合評估報告書（總表）','PAC會議記錄','PAC個案滿意度調查表','正式病歷'],
  hosp:['PAC個案出院追蹤記錄表','護理紀錄/生命徵象'],
  home:['居家復健治療紀錄','居家訪視護理記錄表'],
  day:[],
};
const EXPORT_EXTRA_LABEL={hosp:'住院個案另附',home:'居家個案另附',day:'日照個案另附'};
function renderExportItems(items,checked){
  return items.map(name=>`<div class="export-item"><input type="checkbox" ${checked?'checked':''}><span>${name}</span></div>`).join('');
}
function renderExportModalBody(baseItems,extraItemsMap,modeType,baseChecked,extraChecked){
  const extraItems=extraItemsMap[modeType]||[];
  return `
    <div class="export-group">
      <div class="export-group-label">基本文件</div>
      <div class="export-items">${renderExportItems(baseItems,baseChecked)}</div>
    </div>
    ${extraItems.length?`
    <div class="export-group">
      <div class="export-group-label">${EXPORT_EXTRA_LABEL[modeType]||'另附'}</div>
      <div class="export-items">${renderExportItems(extraItems,extraChecked)}</div>
    </div>
    `:''}
  `;
}
function openExportExtendModal(){
  const c=getCurrentCaseObj();
  const modeType=c?c.modeType:'hosp';
  document.getElementById('export-extend-body').innerHTML=renderExportModalBody(EXPORT_EXTEND_ITEMS.base,EXPORT_EXTEND_ITEMS,modeType,true,false);
  openModal('modal-export-extend');
}
function openExportCloseModal(){
  const c=getCurrentCaseObj();
  const modeType=c?c.modeType:'hosp';
  document.getElementById('export-close-body').innerHTML=renderExportModalBody(EXPORT_CLOSE_ITEMS.base,EXPORT_CLOSE_ITEMS,modeType,true,true);
  openModal('modal-export-close');
}
function openModal(id){document.getElementById(id).classList.remove('hidden')}
function closeModal(id){document.getElementById(id).classList.add('hidden')}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden')}));

function getCurrentCaseObj(){
  return [...CASES.temp,...CASES.formal].find(x=>x.id===currentCase)||null;
}

// ── 預估出院動向（總覽 Tab，僅正式病歷個案，個管師可編輯）──
function updateDischargeDest(caseId,value){
  const c=getCurrentCaseObj();
  if(c){
    c.dischargeDest=value;
    if(value!=='其他') delete c.dischargeDestNote;
  }
  renderPage('detail',currentCase);
}
function updateDischargeDestNote(value){
  const c=getCurrentCaseObj();
  if(c) c.dischargeDestNote=value;
}

// ── 病摘 Tab：護理師確認已接收查看通知（原儀表板佇列上的「✕」按鈕移至此處）──
function confirmNurseReceived(caseId){
  const c=getCurrentCaseObj();
  if(c) c.nurseNotified=false;
  alert('已確認接收，請至杏翔系統完成病摘登打。');
  if(c) renderPage('detail',currentCase);
}

// ── 病摘卡片：住院診斷／出院診斷／病史 編輯 → 儲存（僅臨時病歷階段個管師可用）──
function toggleSummaryEdit(caseId){
  if(summaryEditMode){
    const c=getCurrentCaseObj();
    if(c){
      const adm=document.getElementById('summary-admission-dx');
      const dis=document.getElementById('summary-discharge-dx');
      const mh=document.getElementById('summary-medical-history');
      if(adm) c.admissionDiagnosis=adm.value;
      if(dis) c.dischargeDiagnosis=dis.value;
      if(mh) c.medicalHistory=mh.value;
    }
    summaryEditMode=false;
    renderPage('detail',currentCase);
    alert('病摘已更新，若英文原文有變動，建議重新點擊「輔助翻譯」核對中文對照內容');
  } else {
    summaryEditMode=true;
    renderPage('detail',currentCase);
  }
}

// ── 居家收案流程 步驟①：交付復健主管居家報名，比照日照確認收案 Modal 做法，先確認預計開案／結案日期再正式交付 ──
function openHomeStep1DeliverModal(caseId){
  const c=getCurrentCaseObj();
  const defaultOpenDate='2026-07-09';
  document.getElementById('home-step1-opendate').value=defaultOpenDate;
  document.getElementById('home-step1-closedate').value=calcCloseDateFromOpen(defaultOpenDate,c?(c.diseaseCategory||c.disease):null);
  openModal('modal-home-step1');
}
function updateHomeStep1CloseDate(){
  const c=getCurrentCaseObj();
  const openVal=document.getElementById('home-step1-opendate')?.value;
  if(!openVal||!c) return;
  document.getElementById('home-step1-closedate').value=calcCloseDateFromOpen(openVal,c.diseaseCategory||c.disease);
}
function confirmHomeStep1Deliver(){
  const c=getCurrentCaseObj();
  const openVal=document.getElementById('home-step1-opendate')?.value;
  const closeVal=document.getElementById('home-step1-closedate')?.value;
  if(c){
    c.timelineStep='待評估';
    c.timelineSub='待復健評估';
    if(openVal) c.openDate=openVal.replace(/-/g,'/');
    if(closeVal) c.closeDate=closeVal.replace(/-/g,'/');
  }
  closeModal('modal-home-step1');
  alert('已傳送個案資料給復健主管，時間軸維持在「待復健評估」，等待復健主管回覆。');
  if(c) renderPage('detail',currentCase);
}

// ── 住院／臨時病歷階段：床位安排暫時性手動登記（排床管理模組上線後改由該模組串接）──
function openBedAssignForm(caseId){
  bedAssignFormOpen=true;
  bedAssignFormCaseId=caseId;
  renderPage('detail',currentCase);
}
function cancelBedAssignForm(){
  bedAssignFormOpen=false;
  renderPage('detail',currentCase);
}
function updateBedAssignCloseDate(){
  const c=getCurrentCaseObj();
  const openVal=document.getElementById('bed-assign-opendate')?.value;
  if(!openVal||!c) return;
  document.getElementById('bed-assign-closedate').value=calcCloseDateFromOpen(openVal,c.diseaseCategory||c.disease);
}
function confirmBedAssign(caseId){
  const c=getCurrentCaseObj();
  const openVal=document.getElementById('bed-assign-opendate')?.value;
  const closeVal=document.getElementById('bed-assign-closedate')?.value;
  if(c){
    if(openVal) c.openDate=openVal.replace(/-/g,'/');
    if(closeVal) c.closeDate=closeVal.replace(/-/g,'/');
    c.bedAssigned=true;
    c.timelineStep='待聯絡';
    c.timelineSub='待個案／家屬確認';
  }
  bedAssignFormOpen=false;
  if(c) renderPage('detail',currentCase);
}

// ── 臨時病歷階段：訂正預計開案／結案日期（日照／居家個案），純資料修正，不觸發任何通知或狀態變更 ──
function openEditDatesModal(caseId){
  const c=getCurrentCaseObj();
  if(!c) return;
  document.getElementById('edit-dates-opendate').value=c.openDate?c.openDate.replace(/\//g,'-'):'';
  document.getElementById('edit-dates-closedate').value=c.closeDate?c.closeDate.replace(/\//g,'-'):'';
  openModal('modal-edit-dates');
}
function confirmEditDates(){
  const c=getCurrentCaseObj();
  if(!c){ closeModal('modal-edit-dates'); return; }
  const openVal=document.getElementById('edit-dates-opendate').value;
  const closeVal=document.getElementById('edit-dates-closedate').value;
  if(openVal) c.openDate=openVal.replace(/-/g,'/');
  if(closeVal) c.closeDate=closeVal.replace(/-/g,'/');
  closeModal('modal-edit-dates');
  renderPage('detail',currentCase);
}

// 居家收案流程 步驟②：復健主管回覆「可承接」後，個管師點擊確認，時間軸子階段才正式推進為「待醫師評估」，步驟③解鎖
function confirmRehabAccepted(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.timelineStep='待評估';
    c.timelineSub='待醫師評估';
  }
  alert('已確認復健主管受理，時間軸更新為「待醫師評估」，步驟③已解鎖。');
  if(c) renderPage('detail',currentCase);
}
// 居家收案流程 步驟②：復健主管本人回報功能尚未上線，此處暫由個管師代為電話聯繫後登記回覆結果
function registerRehabReport(caseId,result){
  const c=getCurrentCaseObj();
  if(c){
    c.rehabReport=result;
    c.rehabReportBy='mgr';
  }
  alert(result==='可承接'?'已登記復健主管回覆：可承接。':'已登記復健主管回覆：無法承接。');
  if(c) renderPage('detail',currentCase);
}
// 居家收案流程 步驟②：訂正先前登記的復健主管回覆，清空後回到「登記回覆」按鈕狀態重新登記
function editRehabReport(caseId){
  const c=getCurrentCaseObj();
  if(c){
    delete c.rehabReport;
    delete c.rehabReportBy;
  }
  if(c) renderPage('detail',currentCase);
}
// 居家收案流程 步驟④：醫師接收訪視安排
// 居家收案流程 步驟④：醫師回報到宅評估結果，並通知個管師
function doctorReportHomeVisit(caseId,result){
  const c=getCurrentCaseObj();
  if(c){
    c.doctorReport=result;
    c.doctorReportBy='doctor';
    c.nurseNotified=true;
  }
  alert(result==='pac'?'已回報：符合 PAC 資格，已通知個管師確認收案。':'已回報：不符合 PAC 資格，已通知個管師處理。');
  if(c) renderPage('detail',currentCase);
}
// 居家收案流程 步驟④：醫師以電話口頭告知結果，個管師代為登記（來源標記 doctorReportBy:'mgr'）
function openDoctorReportByMgrModal(caseId){
  const noteInput=document.getElementById('doc-report-mgr-note');
  if(noteInput) noteInput.value='';
  document.querySelectorAll('input[name="doc-report-mgr-result"]').forEach(r=>{r.checked=(r.value==='pac');});
  openModal('modal-doctor-report-mgr');
}
function confirmDoctorReportByMgr(){
  const c=getCurrentCaseObj();
  const note=(document.getElementById('doc-report-mgr-note').value||'').trim();
  if(!note){
    alert('請填寫確認方式');
    return;
  }
  const result=document.querySelector('input[name="doc-report-mgr-result"]:checked')?.value||'pac';
  if(c){
    c.doctorReport=result;
    c.doctorReportBy='mgr';
    c.doctorReportNote=note;
    c.nurseNotified=true;
  }
  closeModal('modal-doctor-report-mgr');
  if(c) renderPage('detail',currentCase);
}
// 居家收案流程 步驟④：訂正先前登記的醫師回報結果，清空後回到回報按鈕／代填連結狀態重新登記
function editDoctorReport(caseId){
  const c=getCurrentCaseObj();
  if(c){
    delete c.doctorReport;
    delete c.doctorReportBy;
    delete c.doctorReportNote;
  }
  if(c) renderPage('detail',currentCase);
}

// ── 展延狀態切換器：不展延／已送出展延（審核中）──
function markNoExtension(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.status='照護中';
    c.timelineStep='照護中';
    c.timelineSub='展延後';
  }
  alert('已標記不展延，個案將從照護中直接進入照護中（展延後）階段，請繼續照護直到即將結案。');
  if(c) renderPage('detail',currentCase);
}
function markExtensionPending(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.status='展延中';
    c.timelineStep='展延中';
    c.timelineSub='待展延申請';
  }
  alert('已標記待送出展延，請盡快備妥資料送出審核');
  if(c) renderPage('detail',currentCase);
}
function markExtensionSubmitted(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.status='展延中';
    c.timelineStep='展延中';
    c.timelineSub='審核中';
  }
  alert('已標記展延已送出，目前審核中，請等待健保署回覆。');
  if(c) renderPage('detail',currentCase);
}
function markExtensionFailed(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.status='照護中';
    c.timelineStep='照護中';
    c.timelineSub='展延後';
    c.hadExtensionFail=true;
  }
  alert('已標記展延失敗，個案進入照護中（展延後）階段，請留意後續結案評估安排。');
  if(c) renderPage('detail',currentCase);
}

// ── 展延成功：開啟 Modal，依疾病別自動帶入新的預計結案日期（以今日 2026/07/09 為基準）──
// ── PAC 收案判斷「是 PAC」→ 確定收案（住院／日照／居家醫師已回報PAC 共用）──
// variant: 'hosp'（僅提示文字）| 'day' | 'homePac'（提示文字＋預計開案日期＋自動算出的結案日期，沿用 PAC_CARE_PERIOD weeksMax 算法）
let collectionConfirmCtx=null;
function calcCloseDateFromOpen(openDateStr,disease){
  const period=PAC_CARE_PERIOD[disease];
  const weeks=period?period.weeksMax:12;
  const d=new Date(openDateStr);
  d.setDate(d.getDate()+weeks*7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function updateCollectionConfirmCloseDate(){
  const c=getCurrentCaseObj();
  const openVal=document.getElementById('collection-confirm-opendate')?.value;
  if(!openVal||!c) return;
  document.getElementById('collection-confirm-closedate').value=calcCloseDateFromOpen(openVal,c.diseaseCategory||c.disease);
}
function openCollectionConfirmModal(caseId,variant){
  collectionConfirmCtx={caseId,variant};
  const c=getCurrentCaseObj();
  const withDate=variant==='day'||variant==='homePac';
  if(withDate){
    const defaultOpenDate='2026-07-09';
    const defaultCloseDate=calcCloseDateFromOpen(defaultOpenDate,c?(c.diseaseCategory||c.disease):null);
    document.getElementById('collection-confirm-body').innerHTML=`
      <div class="info-note blue">是否確定收案？</div>
      <div class="form-group" style="margin-top:12px;margin-bottom:12px">
        <label>預計開案日期</label>
        <input class="form-control" type="date" id="collection-confirm-opendate" value="${defaultOpenDate}" oninput="updateCollectionConfirmCloseDate()">
      </div>
      <div class="form-group">
        <label>結案日期（預估）</label>
        <input class="form-control" type="date" id="collection-confirm-closedate" readonly value="${defaultCloseDate}">
      </div>
    `;
  } else {
    document.getElementById('collection-confirm-body').innerHTML=`<div class="info-note blue">是否確定收案？確認後將自動通知專科護理師查看病摘</div>`;
  }
  openModal('modal-collection-confirm');
}
function confirmCollection(){
  const {variant}=collectionConfirmCtx||{};
  const c=getCurrentCaseObj();
  if(!c){closeModal('modal-collection-confirm');return;}
  c.nurseNotified=true;
  if(variant==='hosp'){
    c.status='待排床';
    c.timelineStep='待排床';
    delete c.timelineSub;
    closeModal('modal-collection-confirm');
    alert(`已通知專科護理師：${c.name} 已確定收案，請留意`);
  } else {
    const openVal=document.getElementById('collection-confirm-opendate')?.value;
    const closeVal=document.getElementById('collection-confirm-closedate')?.value;
    c.status='待聯絡';
    c.timelineStep='待聯絡';
    c.timelineSub='待個案／家屬確認';
    if(variant==='day'&&openVal) c.openDate=openVal.replace(/-/g,'/');
    if(closeVal) c.closeDate=closeVal.replace(/-/g,'/');
    closeModal('modal-collection-confirm');
    alert(variant==='day'?'已確認日照收案，狀態更新為「待聯絡」':'已確認居家收案，狀態更新為「待聯絡」');
  }
  renderPage('detail',currentCase);
}

function openExtensionSuccessModal(caseId){
  const c=getCurrentCaseObj();
  const period=c?PAC_CARE_PERIOD[c.diseaseCategory||c.disease]:null;
  const weeks=period?period.weeksMax:12;
  const base=new Date('2026-07-09');
  base.setDate(base.getDate()+weeks*7);
  const defaultDate=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
  document.getElementById('ext-success-closedate').value=defaultDate;
  document.getElementById('ext-success-note').value='';
  openModal('modal-extension-success');
}
function confirmExtensionSuccess(){
  const c=getCurrentCaseObj();
  const closeDateVal=document.getElementById('ext-success-closedate').value;
  if(c){
    c.status='照護中';
    c.timelineStep='照護中';
    c.timelineSub='展延後';
    if(closeDateVal) c.closeDate=closeDateVal.replace(/-/g,'/');
  }
  closeModal('modal-extension-success');
  alert('展延成功，預計結案日期已更新，已發送站內通知給復健師。');
  if(c) renderPage('detail',currentCase);
}

// 轉介安排「儲存」：僅更新 c.referral 自己的狀態／備註，與主時間軸節點脫鉤
function saveReferral(caseId){
  const c=getCurrentCaseObj();
  if(!c||!c.referral) return;
  const targetSel=document.getElementById('referral-target-select');
  const noteVal=document.getElementById('referral-note')?.value||'';
  const target=targetSel?targetSel.value:'無需轉介';
  c.referral.status=target==='無需轉介'?'待轉介':'轉介中';
  c.referral.note=noteVal;
  alert('轉介安排已儲存');
  renderPage('detail',currentCase);
}
// 家屬聯繫紀錄「個案確定報到」：狀態與時間軸推進為「待開案」
function confirmArrival(caseId){
  const c=getCurrentCaseObj();
  if(c){
    c.status='待開案';
    c.timelineStep='待開案';
    delete c.timelineSub;
  }
  alert('已確認個案確定報到，狀態更新為「待開案」');
  if(c) renderPage('detail',currentCase);
}
// 家屬聯繫紀錄「確定不報到」：依個案照護模式自動預選對應封存類型，理由欄必填
function openNoShowArchive(){
  const c=getCurrentCaseObj();
  const presetMap={hosp:'決定不報到／參加',day:'決定不報到／參加',home:'決定不報到／參加'};
  openArchiveModal({formal:false,presetType:(c&&presetMap[c.modeType])||'決定不報到／參加',locked:true});
}

// ── 轉成正式病歷確認：prototype 測試方便，點擊確認後直接完成建檔（正式上線後仍需行政輸入病歷號才算完成）──
function confirmConvertToFormal(){
  const c=getCurrentCaseObj();
  if(c) c.nurseNotified=true;
  if(!c){ closeModal('modal-convert'); return; }
  const medicalRecordNo='待行政輸入';
  const idx=CASES.temp.indexOf(c);
  if(idx>-1) CASES.temp.splice(idx,1);
  CASES.formal.push(c);
  c.formal=true;
  c.status='照護中';
  c.timelineStep='照護中';
  delete c.timelineSub;
  c.medicalRecordNo=medicalRecordNo;
  if(!c.department){
    const deptByDisease={'腦中風':'神經內科','創傷性神經損傷':'神經內科','脆弱性骨折':'骨科','衰弱高齡':'復健科'};
    c.department=deptByDisease[c.diseaseCategory||c.disease]||'家醫科';
  }
  if(!c.openDate) c.openDate='2026/07/09';
  if(!c.closeDate) c.closeDate=calcCloseDate('2026/07/09',c.diseaseCategory||c.disease);
  if(!c.referral) c.referral={status:'待轉介',note:''};
  closeModal('modal-convert');
  alert(`已成功轉為正式病歷，病歷號：${medicalRecordNo}`);
  renderPage('detail',currentCase);
}

// ── 通知鈴鐺（右上角）：假資料示意行政完成建檔後的通知，僅個管師（mgr）收到此類通知 ──
function renderNotifBell(){
  const container=document.getElementById('notif-bell-container');
  if(!container) return;
  const isMgr=currentRole==='mgr';
  const list=isMgr?NOTIFICATIONS:[];
  const unread=isMgr?NOTIFICATIONS.filter(n=>!n.read).length:0;
  container.innerHTML=`
    <button onclick="toggleNotifDropdown()" style="position:relative;background:none;border:none;cursor:pointer;font-size:18px;padding:4px;line-height:1">
      🔔
      <span style="position:absolute;top:-2px;right:-2px;background:var(--red);color:#fff;font-size:10px;font-weight:700;min-width:15px;height:15px;border-radius:8px;display:${unread>0?'flex':'none'};align-items:center;justify-content:center;padding:0 3px">${unread}</span>
    </button>
    <div style="display:${notifDropdownOpen?'block':'none'};position:absolute;top:32px;right:0;width:300px;background:var(--white);border:1px solid var(--gray-200);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:200;overflow:hidden">
      ${list.length?list.map(n=>`
        <div onclick="markNotifRead(${n.id})" style="padding:10px 12px;font-size:12px;line-height:1.6;border-bottom:1px solid var(--gray-100);cursor:pointer;${n.read?'color:var(--gray-400)':'color:var(--gray-800);background:var(--blue-light)'}">${n.text}</div>
      `).join(''):`<div style="padding:14px;font-size:12px;color:var(--gray-400);text-align:center">目前沒有新通知</div>`}
    </div>
  `;
}
function toggleNotifDropdown(){
  notifDropdownOpen=!notifDropdownOpen;
  renderNotifBell();
}
function markNotifRead(id){
  const n=NOTIFICATIONS.find(x=>x.id===id);
  if(n&&!n.read) n.read=true;
  renderNotifBell();
  alert('已標記為已讀');
}

// ── PAC 判斷＝非PAC：兩步驟處理（匯入排床模組 or 直接封存）──
function nonPacGoArchive(){
  closeModal('modal-nonpac-step1');
  openArchiveModal({formal:false,presetType:'非PAC退案',locked:true});
}

function nonPacGoImport(){
  closeModal('modal-nonpac-step1');
  document.querySelectorAll('input[name="nonpac-hosp-type"]').forEach(r=>r.checked=false);
  openModal('modal-nonpac-step2');
}

function nonPacBackToStep1(){
  closeModal('modal-nonpac-step2');
  openModal('modal-nonpac-step1');
}

function confirmNonPacImport(){
  const checked=document.querySelector('input[name="nonpac-hosp-type"]:checked');
  if(!checked){alert('請選擇住院類型');return;}
  const type=checked.value;
  const c=getCurrentCaseObj();
  if(c){
    c.modeType='general';
    c.mode='一般';
    c.disease=type;
    c.status='封存';
    c.archiveType='非PAC個案';
    c.archiveReason=`收案判斷確認為非PAC個案，選擇住院類型：${type}，個案資料已移交排床管理模組。`;
    c.archiveDate='2026/07/09';
    c.archiveOperator='林美惠';
    c.timelineStep=null;
    delete c.timelineSub;
  }
  closeModal('modal-nonpac-step2');
  alert(`已選擇住院類型：${type}。個案資料已移交排床管理模組，可於排床模組「個案管理匯入」Tab 中選取此個案進行排床。個案管理模組中本個案狀態更新為封存（類型：非PAC個案）。`);
  if(c) renderPage('detail',currentCase);
}

// ── 轉換照護模式（兩步驟）──
let convertModeCtx=null;
function openConvertModeModal(){
  convertModeCtx={step:1,newMode:null};
  renderConvertModeModal();
  openModal('modal-convert-mode');
}
function convertModeNext(){
  const checked=document.querySelector('input[name="convert-mode-radio"]:checked');
  if(!checked){alert('請選擇要轉換的照護模式');return;}
  convertModeCtx.newMode=checked.value;
  convertModeCtx.step=2;
  renderConvertModeModal();
}
function convertModeBack(){
  convertModeCtx.step=1;
  renderConvertModeModal();
}
function renderConvertModeModal(){
  const {step,newMode}=convertModeCtx;
  document.getElementById('convert-mode-title').textContent='轉換照護模式';
  if(step===1){
    document.getElementById('convert-mode-body').innerHTML=`
      <div class="info-note blue" style="margin-bottom:12px">轉換後將保留現有所有紀錄，療程週數不重新計算。</div>
      <div class="retire-list">
        ${['住院','日照','居家'].map(m=>`
          <label class="retire-opt">
            <input type="radio" name="convert-mode-radio" value="${m}" ${newMode===m?'checked':''}>
            <span style="font-size:13px">${m}</span>
          </label>`).join('')}
      </div>
    `;
    document.getElementById('convert-mode-footer').innerHTML=`
      <button class="btn btn-secondary" onclick="closeModal('modal-convert-mode')">取消</button>
      <button class="btn btn-primary" onclick="convertModeNext()">下一步</button>
    `;
  } else {
    const isHomeOrDay=newMode==='居家'||newMode==='日照';
    const infoText=isHomeOrDay?'請填寫轉換後的相關資訊，轉換完成後需至排床模組更新床位狀態。':'轉換為住院後，需至排床模組重新安排床位。';
    const homeHint=newMode==='居家'?`<div class="info-note amber" style="margin-top:10px">轉換為居家後，需重新交付復健主管進行居家報名流程。</div>`:'';
    document.getElementById('convert-mode-body').innerHTML=`
      <div class="info-note blue" style="margin-bottom:12px">${infoText}</div>
      <div class="form-group" style="margin-bottom:10px"><label>轉換日期</label><input class="form-control" type="date" id="convert-mode-date" value="2026-07-09"></div>
      <div class="form-group" style="margin-bottom:10px"><label>新的預計結案日期</label><input class="form-control" type="date" id="convert-mode-closedate"></div>
      <div class="form-group"><label>備註（選填）</label><textarea class="form-control" rows="2" id="convert-mode-note" placeholder="補充說明..."></textarea></div>
      ${homeHint}
    `;
    document.getElementById('convert-mode-footer').innerHTML=`
      <button class="btn btn-secondary" onclick="convertModeBack()">上一步</button>
      <button class="btn btn-primary" onclick="confirmConvertMode()">確認轉換</button>
    `;
  }
}
function confirmConvertMode(){
  const {newMode}=convertModeCtx;
  const modeTypeMap={'住院':'hosp','日照':'day','居家':'home'};
  const c=getCurrentCaseObj();
  if(c){
    c.mode=newMode;
    c.modeType=modeTypeMap[newMode];
    const closeDateVal=document.getElementById('convert-mode-closedate')?.value;
    if(closeDateVal) c.closeDate=closeDateVal.replace(/-/g,'/');
  }
  closeModal('modal-convert-mode');
  alert(`照護模式已轉換為 ${newMode}，請至排床模組更新相關資訊。`);
  if(c) renderPage('detail',currentCase);
}

// ── 封存 Modal（統一入口，temp/formal 兩套清單 + 可鎖定單一類型）──
// opts: {formal, presetType, locked, showCloseDate, showDischargeDest, successMsg(type)=>string}
let archiveCtx=null;
function openArchiveModal(opts){
  archiveCtx={formal:false,presetType:null,locked:false,showCloseDate:false,showDischargeDest:false,successMsg:null,...opts};
  renderArchiveModalBody();
  openModal('modal-archive');
}

function selectArchiveType(type){
  archiveCtx.presetType=type;
  renderArchiveModalBody();
}

function archiveTypeDef(type){
  if(type==='結案失敗') return {type,field:'結案失敗原因'};
  if(type==='正常結案') return {type};
  return [...ARCHIVE_TYPES_TEMP,...ARCHIVE_TYPES_FORMAL].find(o=>o.type===type)||null;
}

function renderArchiveModalBody(){
  const {formal,presetType,locked,showCloseDate,showDischargeDest}=archiveCtx;
  const list=formal?ARCHIVE_TYPES_FORMAL:ARCHIVE_TYPES_TEMP;
  document.getElementById('archive-modal-title').textContent=locked&&presetType?`封存確認：${presetType}`:'封存個案';

  const optsHtml=locked
    ? `<div class="retire-list"><div class="retire-opt selected" style="cursor:default;opacity:.85"><input type="radio" checked disabled><span style="font-size:13px">${presetType}</span></div></div>`
    : `<div class="retire-list">${list.filter(o=>!o.manualHidden).map(o=>`
        <div class="retire-opt ${o.type===presetType?'selected':''}" onclick="selectArchiveType('${o.type}')">
          <input type="radio" name="archive-type" ${o.type===presetType?'checked':''}><span style="font-size:13px">${o.type}</span>
        </div>`).join('')}</div>`;

  const def=presetType?archiveTypeDef(presetType):null;
  const fieldHtml=def&&def.field?`
    <div class="form-group" style="margin-bottom:10px">
      <label>${def.field} <span class="required">*</span></label>
      <textarea class="form-control" rows="2" id="archive-field-input" placeholder="${def.hint||''}"></textarea>
    </div>`:'';

  const dateHtml=showCloseDate?`
    <div class="form-group" style="margin-bottom:10px">
      <label>結案日期</label>
      <input class="form-control" type="date" id="archive-close-date" value="2026-07-09">
    </div>`:'';

  const currentCaseObj=getCurrentCaseObj();
  const destHtml=showDischargeDest?`
    <div class="form-group" style="margin-bottom:10px">
      <label>出院後去向</label>
      <select class="form-control" id="archive-discharge-dest">
        ${DISCHARGE_DEST_OPTIONS.map(o=>`<option value="${o}" ${currentCaseObj&&currentCaseObj.dischargeDest===o?'selected':''}>${o||'請選擇'}</option>`).join('')}
      </select>
    </div>`:'';

  const note=`<div class="info-note amber">封存後個案狀態將轉為「封存」，並記錄以下類型供後續統計。</div>`;

  document.getElementById('archive-modal-body').innerHTML=note+optsHtml+fieldHtml+dateHtml+destHtml;
}

function confirmArchive(){
  const {formal,locked,showCloseDate,showDischargeDest,successMsg}=archiveCtx;
  let type=archiveCtx.presetType;
  if(!locked){
    const checked=document.querySelector('input[name="archive-type"]:checked');
    if(!checked){alert('請選擇封存類型');return;}
  }
  if(!type){alert('請選擇封存類型');return;}
  const def=archiveTypeDef(type);
  let reasonText='';
  if(def&&def.field){
    const input=document.getElementById('archive-field-input');
    reasonText=input?input.value.trim():'';
    if(!reasonText){alert(`請填寫「${def.field}」`);return;}
  }
  const c=getCurrentCaseObj();
  if(c){
    const closeDate=showCloseDate?(document.getElementById('archive-close-date')?.value||'2026-07-09').replace(/-/g,'/'):'2026/07/09';
    c.status='封存';
    c.archiveType=type;
    c.archiveReason=reasonText;
    c.archiveDate=closeDate;
    c.archiveOperator='林美惠';
    if(showCloseDate) c.closeDate=closeDate;
    if(showDischargeDest){
      const destSel=document.getElementById('archive-discharge-dest');
      if(destSel) c.dischargeDest=destSel.value;
    }
    c.timelineStep=null;
    delete c.timelineSub;
  }
  closeModal('modal-archive');
  alert(successMsg?successMsg(type):'個案已封存');
  if(c) renderPage('detail',currentCase);
}

// ── 上游聯繫紀錄：新增 ──
function openUpstreamContactModal(){
  document.getElementById('uc-datetime').value='2026-07-09T09:30';
  document.querySelector('input[name="uc-method"][value="電話"]').checked=true;
  ['uc-status-hosp','uc-status-day','uc-status-home','uc-status-decline'].forEach(id=>document.getElementById(id).checked=false);
  document.getElementById('uc-opendate').value='2026-07-09';
  document.getElementById('uc-opendate-wrap').classList.add('hidden');
  document.getElementById('uc-note').value='';
  openModal('modal-upstream-contact');
}

function toggleUpstreamOpenDate(){
  const anyAdmit=['uc-status-hosp','uc-status-day','uc-status-home'].some(id=>document.getElementById(id).checked);
  document.getElementById('uc-opendate-wrap').classList.toggle('hidden',!anyAdmit);
}

function submitUpstreamContact(){
  const c=getCurrentCaseObj();
  if(!c){closeModal('modal-upstream-contact');return;}
  const datetime=document.getElementById('uc-datetime').value;
  const method=document.querySelector('input[name="uc-method"]:checked').value;
  const statusBoxes=['uc-status-hosp','uc-status-day','uc-status-home','uc-status-decline'].map(id=>document.getElementById(id));
  const statuses=statusBoxes.filter(b=>b.checked).map(b=>b.value);
  const admitSelected=statuses.some(s=>s!=='已回報退案');
  const declineSelected=statuses.includes('已回報退案');
  const openDate=admitSelected?document.getElementById('uc-opendate').value:'';
  const note=document.getElementById('uc-note').value.trim();

  const entry={
    datetime:datetime.replace('T',' '),
    method,
    result:statuses.join('、')||null,
    openDate:openDate?openDate.replace(/-/g,'/'):'',
    note,
  };
  if(!c.upstreamLog) c.upstreamLog=[];
  c.upstreamLog.push(entry);
  if(admitSelected) c.upstreamStatus='已回報收案';
  else if(declineSelected) c.upstreamStatus='已回報退案';

  closeModal('modal-upstream-contact');
  alert('已新增上游聯繫紀錄');
  renderPage('detail',currentCase);
}

function switchRole(role){
  currentRole=role;
  const cfg=ROLES[role];
  document.getElementById('user-av').textContent=cfg.ch;
  document.getElementById('user-av').className='user-avatar '+cfg.av;
  document.getElementById('user-name').textContent=cfg.name;
  document.getElementById('user-role-label').textContent=cfg.label;

  if(role==='doc'||role==='nur'){
    // 醫師／護理師：預設停在臨時病歷 Tab，並自動套用「收案判斷中」篩選，只顯示待判斷個案
    currentPage='list';
    currentListTab='temp';
    roleFilterStatus='收案判斷中';
    docHomeReportFilterActive=false;
  }
  // 個管師（mgr）：維持現有行為，無變化

  // 通知鈴鐺：依角色立即更新（僅個管師收到轉正式病歷建檔通知，其他角色為空狀態），不需重新整理頁面
  renderNotifBell();

  // 重新渲染目前頁面
  if(currentPage==='list') renderPage('list');
  else if(currentPage==='detail'&&currentCase) renderPage('detail',currentCase);
  else if(currentPage==='form'&&currentCase&&currentForm) renderPage('form',currentCase,currentForm);
  else if(currentPage==='his-record'&&currentCase) renderPage('his-record',currentCase);
}

// Init
renderPage('list');
renderNotifBell();
