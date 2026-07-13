
// ── 角色設定 ──
const ROLES = {
  mgr:{name:'林美惠',label:'個案管理師',av:'av-mgr',ch:'林'},
  doc:{name:'張宗達',label:'醫師',av:'av-doc',ch:'張'},
  nur:{name:'陳玉玲',label:'護理師',av:'av-nur',ch:'陳'},
  adm:{name:'蔡書明',label:'行政',av:'av-adm',ch:'蔡'},
};
let currentRole='mgr';
let currentPage='list';
let currentCase=null;
let currentForm=null;
let roleFilterStatus=null; // 醫師／護理師視角的狀態篩選（預設進入時鎖定「收案判斷中」，可自行切換查閱其他狀態）

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
function calcCloseDate(openDateStr,disease){
  // 依疾病別取週數下限，預設值，個管師可手動調整
  const period=PAC_CARE_PERIOD[disease];
  if(!period) return '—';
  const d=new Date(openDateStr.replace(/\//g,'-'));
  d.setDate(d.getDate()+period.weeksMin*7);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
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
    {id:'t1',name:'李志明',birthDate:'1940/03/12',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/24',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',upstreamStatus:'尚未回報',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',roomPref:'single',address:'彰化縣彰化市中山路一段100號'},
    {id:'t2',name:'黃秋香',birthDate:'1948/11/02',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'彰化秀傳',date:'2026/06/22',status:'待補件',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待補件',upstreamStatus:'尚未回報',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'女兒',roomPref:null,address:'彰化縣員林市中正路200號'},
    {id:'t3',name:'吳金水',birthDate:'1945/07/20',mode:'日照',modeType:'day',disease:'腦中風',source:'台中榮總',date:'2026/06/20',status:'收案判斷中',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'收案判斷中',timelineSub:'醫師／護理師收案判斷',upstreamStatus:'尚未回報',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'配偶',roomPref:null,address:'彰化縣鹿港鎮中山路50號'},
    {id:'t4',name:'鄭文雄',birthDate:'1952/01/15',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'門診自轉',date:'2026/06/18',status:'待排床',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待排床',upstreamStatus:'已回報收案',upstreamContact:{name:'—',phone:'—',line:'—'},familyRelation:'兒子',roomPref:'double',address:'彰化縣和美鎮和平路88號'},
    {id:'t5',name:'許美雲',birthDate:'1943/09/08',mode:'居家',modeType:'home',disease:'腦中風',source:'彰基醫院',date:'2026/06/19',status:'待評估',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待評估',timelineSub:'待醫師居家評估',upstreamStatus:'已回報收案',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'女兒',roomPref:null,address:'彰化縣北斗鎮中華路15號'},
    {id:'t6',name:'周大為',birthDate:'1947/04/30',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/15',status:'待聯絡',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待聯絡',upstreamStatus:'已回報收案',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',roomPref:'multi',address:'彰化縣溪湖鎮西環路66號'},
    {id:'t7',name:'蔡素珍',birthDate:'1950/12/25',mode:'日照',modeType:'day',disease:'脆弱性骨折',source:'台中榮總',date:'2026/06/12',status:'待開案',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:'待開案',upstreamStatus:'已回報收案',upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'媳婦',roomPref:null,address:'彰化縣田中鎮中州路120號'},
    {id:'t8',name:'謝國雄',birthDate:'1944/06/17',mode:'住院',modeType:'hosp',disease:'腦中風',source:'彰基醫院',date:'2026/06/08',status:'封存',mgr:'林美惠',formal:false,countdown:null,week:null,timelineStep:null,archiveType:'住院當日未報到',archiveDate:'2026/06/09',archiveOperator:'林美惠',archiveReason:'個案確認入院當日聯繫家屬後表示暫不入院，需重新評估時機。',upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'配偶',roomPref:null,address:'彰化縣二林鎮斗苑路300號'},
  ],
  formal:[
    {id:'f1',name:'陳建國',birthDate:'1954/02/10',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/06/10',status:'展延中',mgr:'林美惠',formal:true,countdown:2,week:2,timelineStep:'展延中',timelineSub:'待展延申請',referral:{status:'待轉介',note:''},upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',openDate:'2026/06/10',closeDate:'2026/07/22',roomPref:'double',address:'彰化縣社頭鄉中山路33號'},
    {id:'f2',name:'王淑芬',birthDate:'1958/08/03',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'彰基醫院',date:'2026/05/28',status:'展延中',mgr:'林美惠',formal:true,countdown:3,week:4,timelineStep:'展延中',timelineSub:'審核中',referral:{status:'待轉介',note:''},upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'女兒',openDate:'2026/05/28',closeDate:'2026/06/11',roomPref:null,address:'彰化縣永靖鄉中山路77號'},
    {id:'f3',name:'劉家豪',birthDate:'1949/05/22',mode:'居家',modeType:'home',disease:'腦中風',source:'台中榮總',date:'2026/06/05',status:'照護中',mgr:'林美惠',formal:true,countdown:null,week:3,timelineStep:'照護中',referral:{status:'待轉介',note:''},upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'兒子',openDate:'2026/06/05',closeDate:'2026/07/17',roomPref:null,address:'彰化縣埔心鄉義民路22號'},
    {id:'f4',name:'林翠娟',birthDate:'1946/10/11',mode:'住院',modeType:'hosp',disease:'脆弱性骨折',source:'台中榮總',date:'2026/04/15',status:'即將結案',mgr:'林美惠',formal:true,countdown:null,week:11,timelineStep:'即將結案',referral:{status:'待轉介',note:''},upstreamContact:{name:'陳出院準備護理師',phone:'04-3333-4444',line:'tc_chen'},familyRelation:'配偶',openDate:'2026/04/15',closeDate:'2026/04/29',roomPref:'single',address:'彰化縣溪州鄉中央路45號'},
    {id:'f5',name:'張明輝',birthDate:'1951/03/28',mode:'日照',modeType:'day',disease:'腦中風',source:'臺大醫院',date:'2026/05/01',status:'即將結案',mgr:'林美惠',formal:true,countdown:null,week:10,timelineStep:'即將結案',referral:{status:'轉介中',note:'轉介長照服務，已聯繫長照管理中心'},upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'兒子',openDate:'2026/05/01',closeDate:'2026/06/12',roomPref:null,address:'彰化縣大村鄉村上路18號'},
    {id:'f6',name:'吳建宏',birthDate:'1948/12/05',mode:'居家',modeType:'home',disease:'腦中風',source:'彰基醫院',date:'2026/03/01',status:'照護中',mgr:'林美惠',formal:true,countdown:null,week:7,timelineStep:'照護中',timelineSub:'展延後',hadExtensionFail:true,referral:{status:'待轉介',note:''},upstreamContact:{name:'劉個管師',phone:'04-4444-5555',line:'cb_liu'},familyRelation:'兒子',openDate:'2026/03/01',closeDate:'2026/05/24',roomPref:null,address:'彰化縣埔鹽鄉南新路9號'},
    {id:'f7',name:'王秀美',birthDate:'1942/09/14',mode:'住院',modeType:'hosp',disease:'腦中風',source:'臺大醫院',date:'2026/02/01',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:12,timelineStep:null,archiveType:'正常結案',archiveDate:'2026/04/26',archiveOperator:'林美惠',upstreamContact:{name:'李護理師',phone:'02-1234-5678',line:'taida_li'},familyRelation:'女兒',openDate:'2026/02/01',closeDate:'2026/04/26',roomPref:'double',address:'彰化縣秀水鄉安東路60號'},
    {id:'f8',name:'郭志強',birthDate:'1956/04/27',mode:'居家',modeType:'home',disease:'脆弱性骨折',source:'彰化秀傳',date:'2026/01/10',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:null,timelineStep:null,archiveType:'結案失敗',archiveDate:'2026/03/15',archiveOperator:'林美惠',archiveReason:'個案病況變化，需轉回急性醫院持續治療，無法繼續 PAC 療程。',upstreamContact:{name:'王個管師',phone:'04-2222-3333',line:'cy_wang'},familyRelation:'兒子',openDate:'2026/01/10',closeDate:'2026/01/24',roomPref:null,address:'彰化縣花壇鄉中山路150號'},
    // 封存：正式病歷非PAC個案（PAC判斷後確認為非PAC，移交病床管理並封存於此模組）
    {id:'f9',name:'陳淑真',birthDate:'1955/07/19',mode:'一般',modeType:'general',disease:'一般復健（中風/脊椎損傷，非PAC專案）',source:'門診',date:'2026/06/01',status:'封存',mgr:'林美惠',formal:true,countdown:null,week:null,timelineStep:null,archiveType:'非PAC個案',archiveDate:'2026/06/03',archiveOperator:'林美惠',archiveReason:'收案判斷確認為非PAC個案，個案資料已移交病床管理模組統一管轄。',upstreamContact:{name:'—',phone:'—',line:'—'},familyRelation:'女兒',openDate:'2026/06/01',closeDate:'—',roomPref:null,address:'彰化縣芬園鄉彰南路5號'},
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
    {label:'待評估',sub:'待復健主管回覆是否收治'},
    {label:'確認收案',sub:'居家'},
    {label:'待聯絡',sub:'待個案／家屬確認'},
    {label:'待評估',sub:'待醫師評估'},
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
  {label:'待轉介',event:true},
  {label:'待安排出院/結束服務',event:true},
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
}

let currentListTab='temp'; // 'temp' | 'formal' | 'archive'
let tabView={temp:'card',formal:'card'}; // 各 Tab 各自的視圖狀態：'card' or 'list'（封存 Tab 僅列表視圖，不記錄於此）
let listSelection={temp:null,formal:null,archive:null}; // 列表視圖（左右分割）時，各 Tab 目前選中的個案 id

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

  // 醫師／護理師視角：套用狀態篩選（唯讀查閱），預設鎖定「收案判斷中」
  const applyRoleFilter=(arr)=>(isJudgeRole&&roleFilterStatus)?arr.filter(c=>c.status===roleFilterStatus):arr;

  const tempActive=applyRoleFilter(CASES.temp.filter(c=>c.status!=='封存'));
  const formalActive=applyRoleFilter(CASES.formal.filter(c=>c.status!=='封存'));
  const archiveCases=allCases.filter(c=>c.status==='封存');
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
    tabBodyHtml=`
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:10px;max-height:calc(100vh - 340px);overflow-y:auto">
          ${archiveCases.length?archiveCases.map(c=>caseListSidebarItem(c,'archive')).join(''):`<div style="text-align:center;padding:20px 8px;color:var(--gray-400);font-size:12px">目前沒有封存個案</div>`}
        </div>
        <div id="list-detail-panel" style="flex:1;min-width:0"></div>
      </div>
    `;
  } else if(tabView[currentListTab]==='card'){
    tabBodyHtml=`<div class="case-grid">${currentTabCases.map(c=>caseCard(c)).join('')}</div>`;
  } else {
    tabBodyHtml=`
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;background:var(--white);border:1px solid var(--gray-200);border-radius:10px;padding:10px;max-height:calc(100vh - 340px);overflow-y:auto">
          ${currentTabCases.length?currentTabCases.map(c=>caseListSidebarItem(c,currentListTab)).join(''):`<div style="text-align:center;padding:20px 8px;color:var(--gray-400);font-size:12px">目前沒有個案</div>`}
        </div>
        <div id="list-detail-panel" style="flex:1;min-width:0"></div>
      </div>
    `;
  }

  container.innerHTML=`
    ${isJudgeRole?`
    <div style="background:var(--amber-light);border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;font-weight:600;color:var(--amber)">
      ⚠️ 以下個案待您完成收案判斷，其他狀態個案可透過篩選查閱
    </div>
    `:''}
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

    <!-- 統計卡：上排7個常態狀態（移除新轉介） -->
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
        <div class="tab ${currentListTab==='archive'?'active':''}" onclick="switchTab('archive')" style="color:var(--gray-400)">封存 <span class="badge badge-gray" style="margin-left:4px">${archiveCases.length}</span></div>
      </div>
      ${currentListTab!=='archive'?`<div class="view-toggle">
        <button class="view-toggle-btn ${tabView[currentListTab]==='card'?'active':''}" onclick="switchView('card')">▦ 卡片</button>
        <button class="view-toggle-btn ${tabView[currentListTab]==='list'?'active':''}" onclick="switchView('list')">☰ 列表</button>
      </div>`:''}
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
  return `<div style="padding:9px 10px;border-radius:7px;cursor:pointer;${selected?'background:var(--blue-light);border:1px solid var(--blue-mid)':'border:1px solid transparent'}">
    <div onclick="selectListCase('${tabKey}','${c.id}')">
      <div style="font-size:13px;font-weight:600;color:${selected?'var(--blue)':'var(--gray-800)'}">${c.name}${age!==null?`<span style="font-size:11px;color:var(--gray-400);font-weight:500">(${age})</span>`:''}</div>
      <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${c.mode}・${c.disease}</div>
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
function switchView(view){
  if(currentListTab==='archive') return; // 封存 Tab 僅列表視圖，無切換
  tabView[currentListTab]=view;
  renderList(document.getElementById('main-content'));
}
function selectListCase(tabKey,caseId){
  listSelection[tabKey]=caseId;
  renderList(document.getElementById('main-content'));
}

function filterByStatus(status){
  document.getElementById('status-filter').value=status;
  onStatusFilterChange(status);
}
function onStatusFilterChange(status){
  if(currentRole==='doc'||currentRole==='nur'){
    // 醫師／護理師視角：篩選僅限縮目前 Tab 內容（唯讀查閱），不切換 Tab
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
  alert('病歷號已輸入，個案已正式轉入正式病歷 Tab，系統將通知負責個管師。');
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

  if(currentRole==='adm'){
    return `<div class="case-card" style="${cardBorder}" onclick="renderPage('detail','${c.id}')">
      <div class="mode-stripe ${modeClass}"></div>
      <div class="case-card-header"><div><div class="case-name">${nameWithAge}</div><div class="case-id">${c.mode}・${c.disease}</div></div>${statusBadge}</div>
      <div class="admin-key-field"><label>身分證字號</label><span>A123456789</span></div>
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:7px">
        <div class="case-field"><label>入院日期</label><span>${c.date}</span></div>
        <div class="case-field"><label>床位</label><span>${c.formal?'A301':'待確認'}</span></div>
      </div>
    </div>`;
  }

  return `<div class="case-card" style="${cardBorder}" onclick="renderPage('detail','${c.id}')">
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
      <button class="btn btn-danger btn-sm" onclick="openArchiveModal({formal:false})">退案</button>
      <button class="btn btn-secondary btn-sm" onclick="openArchiveModal({formal:false})">封存</button>
    `;
    else actions=`
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-translate')">📄 病摘翻譯</button>
      <button class="btn btn-ghost btn-sm" onclick="openConvertModeModal()">🔁 轉換模式</button>
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-export-extend')">📤 匯出展延</button>
      <button class="btn btn-ghost btn-sm" onclick="openModal('modal-export-close')">📤 匯出結案</button>
      <button class="btn btn-secondary btn-sm" onclick="openArchiveModal({formal:true})">封存</button>
      <button class="btn btn-green btn-sm" onclick="openArchiveModal({formal:true,presetType:'正常結案',locked:true,showCloseDate:true,successMsg:()=>'已成功結案，個案移至封存'})">✓ 成功結案</button>
      <button class="btn btn-danger btn-sm" onclick="openArchiveModal({formal:true,presetType:'結案失敗',locked:true,showCloseDate:true,successMsg:()=>'已標記結案失敗，個案移至封存'})">不成功結案</button>
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
          <div class="form-group"><label>判斷 PAC 疾病別</label><input class="form-control" value="${c.disease}" readonly></div>
          <div class="form-group"><label>判斷者</label><input class="form-control" value="張宗達 醫師" readonly></div>
          <div class="form-group" style="grid-column:1/-1"><label>判斷原因</label><textarea class="form-control" rows="2" readonly>個案符合 ${c.disease} PAC 收案條件，開刀位置及病摘內容確認無誤，建議收案。</textarea></div>
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
          <div class="form-group"><label>判斷 PAC 疾病別</label><input class="form-control" value="${c.disease}" ${isAdm?'readonly':''}></div>
          <div class="form-group"><label>判斷者</label><input class="form-control" value="張宗達 醫師" readonly></div>
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
          ${isMgr?`<button class="btn btn-purple btn-sm" onclick="alert('已通知專科護理師：${c.name} 已確定收案，請留意')">📨 轉交給專科護理師</button>`:''}
          ${actions}
        </div>
      </div>
      <div class="detail-meta">
        <div class="meta-item"><strong>轉介來源：</strong>${c.source}</div>
        <div class="meta-item"><strong>轉介日期：</strong>${c.date}</div>
        ${isFormal?`<div class="meta-item"><strong>病歷號：</strong>00073450</div>`:''}
        ${isFormal&&c.mode==='住院'?`<div class="meta-item"><strong>床位：</strong>A301</div>`:''}
        <div class="meta-item"><strong>負責個管師：</strong>林美惠</div>
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
        <button class="btn btn-green btn-sm" onclick="openArchiveModal({formal:true,presetType:'正常結案',locked:true,showCloseDate:true,successMsg:()=>'已成功結案，個案移至封存'})">✓ 成功結案</button>
        <button class="btn btn-danger btn-sm" onclick="openArchiveModal({formal:true,presetType:'結案失敗',locked:true,showCloseDate:true,successMsg:()=>'已標記結案失敗，個案移至封存'})">不成功結案</button>
      </div>
    </div>
    `:''}

    <!-- 進度條 -->
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
            ${s.active?`<div style="font-size:9px;color:var(--blue);font-weight:700;margin-top:2px">進行中</div>`:''}
          </div>`).join('')}
        </div>
      </div>
    </div>

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
          <button class="btn ${c.status==='照護中'?'btn-secondary':'btn-ghost'} btn-sm" onclick="alert('狀態更新為「展延中・待展延申請」')">② 待送出展延</button>
          <button class="btn ${c.status==='展延中'?'btn-amber':'btn-ghost'} btn-sm" onclick="markExtensionSubmitted('${c.id}')">③ 已送出展延（審核中）</button>
          <button class="btn btn-green btn-sm" onclick="openExtensionSuccessModal('${c.id}')">④ 展延成功</button>
          <button class="btn btn-danger btn-sm" onclick="alert('狀態更新為「即將結案」，請安排結案評估')">⑤ 展延失敗</button>
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
          ${isFormal&&c.mode==='住院'?`<div class="info-item"><label>床位</label><span>A301</span></div><div class="info-item"><label>主治醫師</label><span>張宗達 醫師</span></div>`:''}
          ${isFormal?`<div class="info-item"><label>開案日</label><span>${c.openDate||'—'}</span></div><div class="info-item"><label>結案日（預估）</label><span>${c.closeDate||'—'}</span></div>`:''}
        </div>
        <div class="divider"></div>
        <div class="info-grid">
          <div class="info-item"><label>家屬姓名</label><span>陳小明${c.familyRelation?`（${c.familyRelation}）`:''}</span></div>
          <div class="info-item"><label>家屬電話</label><span>0912-345-678</span></div>
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
              <button class="btn btn-green btn-xs" onclick="alert('已確認個案確定報到，狀態更新為「待開案」')">✓ 個案確定報到</button>
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

    <!-- 模式別確認收案流程（僅臨時病歷階段顯示）-->
    ${!isFormal&&isMgr?renderModeFlowBlock(c):''}

    <!-- 病摘 -->
    <div class="section-card">
      <div class="sc-header">
        <div class="sc-title">📄 病摘</div>
        ${isMgr?`<div style="display:flex;gap:6px"><button class="btn btn-ghost btn-xs" onclick="openModal('modal-translate')">輔助翻譯</button></div>`:''}
      </div>
      <div class="sc-body">
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:8px">英文原文</div>
        <div style="font-size:12px;line-height:1.75;color:var(--gray-700);background:var(--gray-50);padding:12px;border-radius:6px;margin-bottom:14px">
          Left MCA infarction with right hemiparesis. Patient is a 72-year-old male who presented with sudden onset of right-sided weakness and aphasia. CT scan confirmed left middle cerebral artery territory infarction. Patient underwent thrombolysis and is now stable for PAC rehabilitation program.
        </div>
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
        ${isMgr?`<div class="upload-zone" style="padding:14px" onclick="alert('選擇檔案上傳（PDF / Word / JPG / 影片）')"><div style="font-size:12px">📎 點擊或拖曳上傳附件（PDF / Word / JPG / 影片）</div></div>`:''}
      </div>
    </div>

    <!-- PAC 收案判斷 -->
    ${judgeBlock}

    <!-- 醫療紀錄查看（僅住院個案，正式病歷階段）-->
    ${isFormal&&c.modeType==='hosp'?`
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
        </div>
      </div>
    </div>
    ` : ''}

    <!-- 復健排班查看（正式病歷階段・僅居家個案）-->
    ${isFormal&&c.modeType==='home'?`
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">📅 復健排班查看</div></div>
      <div class="sc-body" style="padding:0">
        <div class="form-item" style="margin:16px;border-radius:8px" onclick="showLinkTip('復健排班查看','復健排班模組')">
          <div class="form-item-left"><div class="form-icon">📅</div><div><div class="form-name">查看此個案的復健排班</div><div class="form-meta">前往復健排班模組</div></div></div>
          <span class="form-status fs-pending">前往 →</span>
        </div>
      </div>
    </div>
    `:''}

    <!-- 相關表單 -->
    ${isFormal?`
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">📑 相關表單</div></div>
      <div class="sc-body">
        ${formsList(formData.common,'在院期間表單')}
        ${formData.post.length?`<div class="divider"></div>${formsList(formData.post,'結案後表單')}`:''}
      </div>
    </div>
    `:''}

    <!-- 轉介安排（次要欄位，置於頁面下方；正式病歷階段常駐顯示，不限即將結案才出現）-->
    ${isFormal&&c.status!=='封存'&&c.referral?`
    <div class="section-card">
      <div class="sc-header">
        <div class="sc-title">🔄 轉介安排</div>
        <span class="badge ${c.referral.status==='已轉介'?'badge-green':c.referral.status==='轉介中'?'badge-amber':'badge-gray'}">${c.referral.status}</span>
      </div>
      <div class="sc-body">
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:10px">個管師可隨時安排轉介，不限結案前才處理。常見轉介去向：居家醫療／長照／社工。</div>
        <div class="form-group" style="margin-bottom:10px">
          <label>轉介去向</label>
          <select class="form-control" ${isMgr?'':'disabled'}>
            <option ${c.referral.status==='待轉介'?'selected':''}>無需轉介</option>
            <option>轉介居家醫療</option><option>轉介長照服務</option><option>轉介社工服務</option>
          </select>
        </div>
        <div class="form-group">
          <label>轉介備註</label>
          <textarea class="form-control" rows="2" ${isMgr?'':'readonly'} placeholder="轉介服務說明、聯絡窗口等…">${c.referral.note||''}</textarea>
        </div>
        ${isMgr?`<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="alert('轉介安排已儲存，狀態更新為「待安排出院/結束服務」')">儲存</button></div>`:''}
      </div>
    </div>
    `:''}
  `;
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
  if(result==='是 PAC'){
    alert('判斷結果：是 PAC\n\n狀態將依照護模式（住院/日照/居家）轉換為「確認收案」');
  } else if(result==='非 PAC'){
    openModal('modal-nonpac-step1');
  } else {
    alert('判斷結果：需再評估\n\n狀態維持不變，已記錄本次判斷意見供後續參考');
  }
}

function renderModeFlowBlock(c){
  if(c.modeType==='hosp'){
    const confirmed=c.status==='確認收案'||['待聯絡','待開案'].includes(c.status);
    return `
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">🏥 住院收案流程</div>${confirmed?'<span class="badge badge-purple">確認收案</span>':'<span class="badge badge-gray">待排床</span>'}</div>
      <div class="sc-body">
        <div style="font-size:11px;color:var(--gray-400);margin-bottom:10px">預約床位後狀態自動轉為「確認收案」，可至上方按鈕通知專科護理師。</div>
        ${!confirmed?`<button class="btn btn-secondary btn-sm" onclick="alert('已進入收案流程確認，後續可由個案管理師完成收案')">→ 確認收案流程</button>`:`<div style="font-size:12px;color:var(--green);font-weight:600">✓ 已預約床位 A301，狀態已轉為「確認收案」</div>`}
      </div>
    </div>`;
  }
  if(c.modeType==='day'){
    const confirmed=c.status==='確認收案'||['待聯絡','待開案'].includes(c.status);
    return `
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">☀️ 日照收案流程</div>${confirmed?'<span class="badge badge-purple">確認收案</span>':'<span class="badge badge-gray">待確認</span>'}</div>
      <div class="sc-body">
        <div class="form-row" style="margin-bottom:12px">
          <div class="form-group"><label>開案日期</label><input class="form-control" type="date" value="2026-06-26"></div>
          <div class="form-group"><label>結案日期（預估）</label><input class="form-control" type="date" value="2026-08-07"></div>
        </div>
        ${!confirmed?`<button class="btn btn-amber btn-sm" onclick="alert('狀態更新為「確認收案・日照」')">確認日照收案</button>`:`<div style="font-size:12px;color:var(--green);font-weight:600">✓ 已確認日照收案</div>`}
      </div>
    </div>`;
  }
  if(c.modeType==='home'){
    const stage=c.status; // 待補件/收案判斷中 → 待評估(待復健主管回覆) → 確認收案 → 待聯絡 → 待評估(待醫師居家評估) → 待開案
    return `
    <div class="section-card">
      <div class="sc-header"><div class="sc-title">🏡 居家收案流程</div><span class="badge badge-amber">${stage}</span></div>
      <div class="sc-body">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
            <div style="font-size:12px"><strong>① 交付復健主管居家報名</strong><div style="font-size:11px;color:var(--gray-400);margin-top:2px">傳送時間／個案基本資料／病摘／住址給復健主管</div></div>
            <button class="btn btn-secondary btn-xs" onclick="alert('已傳送個案資料給復健主管，狀態更新為「待評估」')">交付</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
            <div style="font-size:12px"><strong>② 確認收案</strong><div style="font-size:11px;color:var(--gray-400);margin-top:2px">復健主管回報承接後，個管師點選確認</div></div>
            <button class="btn btn-secondary btn-xs" onclick="alert('狀態更新為「確認收案・居家」')">確認收案</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border:1px solid var(--gray-200);border-radius:7px">
            <div style="font-size:12px"><strong>③ 轉交醫師居家評估</strong><div style="font-size:11px;color:var(--gray-400);margin-top:2px">通知醫師安排居家首次訪視，二次確認 PAC 資格</div></div>
            <button class="btn btn-secondary btn-xs" onclick="alert('已通知醫師安排居家評估')">轉交醫師</button>
          </div>
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

// ── 工具函式 ──
function switchModalTab(el,targetId){
  el.closest('.modal-body').querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['new-manual','new-ocr','new-his'].forEach(id=>{
    const el2=document.getElementById(id);
    if(el2) el2.classList.toggle('hidden',id!==targetId);
  });
}
function toggleDiseaseSelect(category){
  document.getElementById('new-pac-disease-wrap').style.display=category==='pac'?'block':'none';
  document.getElementById('new-general-disease-wrap').style.display=category==='general'?'block':'none';
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
function showLinkTip(formName,target){
  alert(`「${formName}」屬於${target}的功能範圍，將跳轉至 ${target} 查看／填寫。\n\n（prototype 示意，實際串接後將直接導向該模組對應頁面）`);
}
function openModal(id){document.getElementById(id).classList.remove('hidden')}
function closeModal(id){document.getElementById(id).classList.add('hidden')}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden')}));

function getCurrentCaseObj(){
  return [...CASES.temp,...CASES.formal].find(x=>x.id===currentCase)||null;
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

// ── 展延成功：開啟 Modal，依疾病別自動帶入新的預計結案日期（以今日 2026/07/09 為基準）──
function openExtensionSuccessModal(caseId){
  const c=getCurrentCaseObj();
  const period=c?PAC_CARE_PERIOD[c.disease]:null;
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

// 家屬聯繫紀錄「確定不報到」：依個案照護模式自動預選對應封存類型，理由欄必填
function openNoShowArchive(){
  const c=getCurrentCaseObj();
  const presetMap={hosp:'決定不報到／參加',day:'決定不報到／參加',home:'決定不報到／參加'};
  openArchiveModal({formal:false,presetType:(c&&presetMap[c.modeType])||'決定不報到／參加',locked:true});
}

// ── 轉成正式病歷確認：關閉 Modal 後依序顯示兩則 alert，並提醒行政完成杏翔建檔 ──
function confirmConvertToFormal(){
  closeModal('modal-convert');
  alert('已轉換為正式病歷，相關表單已自動建立，行政通知已發出');
  alert('已通知行政人員，請行政至個案管理模組完成杏翔建檔並輸入病歷號，完成後您將收到通知。');
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
// opts: {formal, presetType, locked, showCloseDate, successMsg(type)=>string}
let archiveCtx=null;
function openArchiveModal(opts){
  archiveCtx={formal:false,presetType:null,locked:false,showCloseDate:false,successMsg:null,...opts};
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
  const {formal,presetType,locked,showCloseDate}=archiveCtx;
  const list=formal?ARCHIVE_TYPES_FORMAL:ARCHIVE_TYPES_TEMP;
  document.getElementById('archive-modal-title').textContent=locked&&presetType?`封存確認：${presetType}`:'封存個案';

  const optsHtml=locked
    ? `<div class="retire-list"><div class="retire-opt selected" style="cursor:default;opacity:.85"><input type="radio" checked disabled><span style="font-size:13px">${presetType}</span></div></div>`
    : `<div class="retire-list">${list.map(o=>`
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

  const note=`<div class="info-note amber">封存後個案狀態將轉為「封存」，並記錄以下類型供後續統計。</div>`;

  document.getElementById('archive-modal-body').innerHTML=note+optsHtml+fieldHtml+dateHtml;
}

function confirmArchive(){
  const {formal,locked,showCloseDate,successMsg}=archiveCtx;
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
  }
  // 個管師（mgr）：維持現有行為，無變化

  // 通知鈴鐺：依角色立即更新（僅個管師收到轉正式病歷建檔通知，其他角色為空狀態），不需重新整理頁面
  renderNotifBell();

  // 重新渲染目前頁面
  if(currentPage==='list') renderPage('list');
  else if(currentPage==='detail'&&currentCase) renderPage('detail',currentCase);
  else if(currentPage==='form'&&currentCase&&currentForm) renderPage('form',currentCase,currentForm);
}

// Init
renderPage('list');
renderNotifBell();
