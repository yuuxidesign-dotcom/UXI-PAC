
const ROLES={mgr:{n:'林美惠',l:'個案管理師',av:'av-m',ch:'林'},nur:{n:'陳玉玲',l:'護理師',av:'av-n',ch:'陳'},adm:{n:'蔡書明',l:'行政',av:'av-a',ch:'蔡'}};
const PAC_WK={p1:42,p2:14,p3:42};
function switchRole(r){const c=ROLES[r];document.getElementById('ua').textContent=c.ch;document.getElementById('ua').className='uav '+c.av;document.getElementById('uname').textContent=c.n;document.getElementById('urole').textContent=c.l;const ro=r!=='mgr';document.getElementById('ro-banner').classList.toggle('show',ro);document.getElementById('btn-new').classList.toggle('hidden',ro);}
function switchMain(el,id){document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');['tc-case','tc-bed','tc-today-update','tc-need-mrn','tc-weekinout','tc-discharged'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.toggle('hidden',i!==id);});}
// 統計卡第二排（時間提醒）與儀表板卡片共用：切到個案排床總覽分頁，並捲動到對應區塊，不做篩選
function scrollToCaseSection(sectionId){
  switchMain(document.getElementById('tab-case'),'tc-case');
  const sec=document.getElementById(sectionId);
  if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'});
}
function goToTodayBeds(type){
  scrollToCaseSection(type==='in'?'section-today-in':'section-today-out');
}

// ── 儀表板統計卡第一排（狀態統計）篩選：點擊套用／再點一次取消，最多同時一張卡片選取中 ──
let dashFilter=null;
const CASE_FILTER_KEYS=['pending','reserved','hosp-pac','hosp-gen','hosp-hos'];
const BED_FILTER_KEYS=['avail','clean','pack'];
const BED_STATUS_LABEL={avail:'可使用',clean:'清潔維修',pack:'包房'};
function toggleStatFilter(key,el){
  dashFilter=(dashFilter===key)?null:key;
  document.querySelectorAll('.stats-strip .sc').forEach(c=>c.classList.remove('active-filter'));
  if(dashFilter&&el) el.classList.add('active-filter');
  if(dashFilter){
    if(BED_FILTER_KEYS.includes(dashFilter)){
      switchMain(document.getElementById('tab-bed'),'tc-bed');
      switchView('list');
    } else if(CASE_FILTER_KEYS.includes(dashFilter)){
      const caseHidden=document.getElementById('tc-case').classList.contains('hidden');
      if(caseHidden) switchMain(document.getElementById('tab-case'),'tc-case');
    }
  }
  applyBedFilter();
  applyCaseFilter();
}
// 床位總覽・列表視圖：依每列 data-bed-status 屬性篩選出符合「可使用」／「清潔維修」的床位列，其餘列隱藏
function applyBedFilter(){
  const label=BED_FILTER_KEYS.includes(dashFilter)?BED_STATUS_LABEL[dashFilter]:null;
  const body=document.querySelector('#vlist tbody');
  if(!body) return;
  [...body.children].forEach(row=>{
    row.classList.toggle('hidden',!!label&&row.getAttribute('data-bed-status')!==label);
  });
}
// 隱藏／顯示「標題列＋緊接在後的表格」這組區塊
function setBlockHidden(headerId,hidden){
  const hdr=document.getElementById(headerId);
  if(!hdr) return;
  hdr.classList.toggle('hidden',hidden);
  const table=hdr.nextElementSibling;
  if(table) table.classList.toggle('hidden',hidden);
}
function filterRows(bodyId,predicate){
  const body=document.getElementById(bodyId);
  if(!body) return;
  [...body.children].forEach(row=>{
    if(row.classList.contains('xrow')||row.id==='reserved-empty') return;
    const hide=!predicate(row);
    row.classList.toggle('hidden',hide);
    const next=row.nextElementSibling;
    if(next&&next.classList.contains('xrow')&&hide) next.classList.add('hidden');
  });
}
// 轉介來源篩選（工具列）：僅做最基本的文字比對，獨立運作、不與上方統計卡篩選疊加判斷
function applyReferralFilter(val){
  ['pending-body','reserved-body','hosp-body','extend-body'].forEach(bodyId=>{
    filterRows(bodyId,row=>!val||row.getAttribute('data-referral')===val);
  });
}
// 個案排床總覽：待排床／已預約／住院中（可再依 PAC・一般・安寧細分）篩選，其餘區塊（今日入院／今日出院／展延）篩選時一律暫時隱藏
function applyCaseFilter(){
  const f=CASE_FILTER_KEYS.includes(dashFilter)?dashFilter:null;
  const secIn=document.getElementById('section-today-in');
  const secOut=document.getElementById('section-today-out');
  if(secIn) secIn.classList.toggle('hidden',!!f);
  if(secOut) secOut.classList.toggle('hidden',!!f);
  setBlockHidden('hdr-extend',!!f);
  setBlockHidden('hdr-waiting',!!f);
  setBlockHidden('hdr-pending',!!f&&f!=='pending');
  setBlockHidden('hdr-reserved',!!f&&f!=='reserved');
  setBlockHidden('hdr-hosp',!!f&&!f.startsWith('hosp-'));
  filterRows('hosp-body',r=>{
    if(!f) return true;
    if(f==='hosp-pac') return !!r.querySelector('.tt-pac');
    if(f==='hosp-gen') return !!r.querySelector('.tt-gen');
    if(f==='hosp-hos') return !!r.querySelector('.tt-hos');
    return true;
  });
}
// 已出院列表的「出院日」欄位有兩種既有格式：動態新增列是完整「2026/06/25」，種子列是簡短「06/24」（預設年份 2026）
function parseListDate(str){
  if(!str||str==='—') return null;
  const parts=str.trim().split('/');
  if(parts.length===3){ const d=new Date(parts[0]+'-'+parts[1]+'-'+parts[2]); return isNaN(d)?null:d; }
  if(parts.length===2){ const d=new Date('2026-'+parts[0]+'-'+parts[1]); return isNaN(d)?null:d; }
  return null;
}
// 已出院分頁：姓名／床號關鍵字 + 出院日期區間篩選（僅前端 UI 與基本日期比對，不串接真實資料運算）
// filterDischargedList 定義移至下方（已出院列表改版後的完整篩選邏輯，含上游醫院/疾病別/住院類型）
function switchFloor(el,id){document.querySelectorAll('.ftabs .ft').forEach(t=>t.classList.remove('active'));el.classList.add('active');['f3','f5','f6'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.toggle('hidden',i!==id);});}
function switchView(v){document.getElementById('vgrid').classList.toggle('hidden',v!=='grid');document.getElementById('vlist').classList.toggle('hidden',v!=='list');document.getElementById('vbg').classList.toggle('active',v==='grid');document.getElementById('vbl').classList.toggle('active',v==='list');}
function toggleX(id){const row=document.getElementById(id);const btn=document.getElementById('xb'+id.replace('x',''));const h=row.classList.contains('hidden');row.classList.toggle('hidden',!h);if(btn)btn.textContent=h?'▼':'▶';}
function onCS(val){const cp=document.getElementById('cprev');const box=document.getElementById('cprev-box');const warn=document.getElementById('rwarn');const dis=document.getElementById('disdate');if(!val){cp.classList.add('hidden');return;}cp.classList.remove('hidden');const d={p1:{t:'陳志明・68歲男・腦中風・房型偏好：單人房',w:42,warn:true},p2:{t:'蔡美玲・72歲女・脆弱性骨折・房型偏好：無偏好',w:14,warn:false},p3:{t:'黃建國・55歲男・創傷性神經損傷・房型偏好：雙人房',w:42,warn:false},h1:{t:'王大明・76歲男・末期癌症（胃癌）',w:null,warn:false},g1:{t:'張惠美・64歲女・一般復健',w:null,warn:false},g2:{t:'林志偉・45歲男・外科開刀',w:null,warn:false},t1:{t:'排床測試・68歲男・脆弱性骨折・房型偏好：無偏好',w:14,warn:false}}[val]||{t:'個案資料',w:null,warn:false};box.innerHTML='個案：<strong>'+d.t+'</strong>';if(d.w){const dt=new Date('2026-06-25');dt.setDate(dt.getDate()+d.w);const y=dt.getFullYear(),m=String(dt.getMonth()+1).padStart(2,'0'),dd=String(dt.getDate()).padStart(2,'0');dis.value=y+'-'+m+'-'+dd;box.innerHTML+='<br><span style="font-size:11px;color:var(--blue)">預計出院日依疾病別（'+d.w/7+'週療程）自動帶入，可手動調整。</span>';}else{dis.value='';}warn.classList.toggle('hidden',!d.warn);selectedCaseGender=CASE_GENDER[val]||null;applyPillGenderLock();}
function selBed(el,bed,type){if(el.classList.contains('tk'))return;document.querySelectorAll('.bpc.pk').forEach(c=>c.classList.remove('pk'));el.classList.add('pk');document.getElementById('selb').textContent=bed+'（'+type+'）';}

// ── 床位性別／混合限制：讀取病室卡片檢視的實際入住狀態，判斷該病室目前住客性別 ──
function getRoomBlk(roomNo){
  return [...document.querySelectorAll('#vgrid .room-blk')].find(rb=>rb.querySelector('.room-no').childNodes[0].textContent.trim()===roomNo);
}
function getRoomGenders(roomNo){
  const genders=new Set();
  const blk=getRoomBlk(roomNo);
  if(!blk) return genders;
  blk.querySelectorAll('.bc').forEach(bc=>{
    if(bc.classList.contains('avail')||bc.classList.contains('clean')) return;
    if(bc.querySelector('.av-ml')) genders.add('m');
    if(bc.querySelector('.av-fe')) genders.add('f');
  });
  return genders;
}
// 病室卡片檢視：多人房的空床卡片上標示「同房已有男性/女性」，該病室目前沒有住客或住客性別混合時不顯示
function applyRoomGenderTags(){
  document.querySelectorAll('#vgrid .room-blk').forEach(blk=>{
    const bedsG=blk.querySelector('.beds-g');
    if(!bedsG||bedsG.classList.contains('c1')) return;
    const roomNo=blk.querySelector('.room-no').childNodes[0].textContent.trim();
    const genders=getRoomGenders(roomNo);
    if(genders.size!==1) return;
    const g=[...genders][0];
    const label=g==='m'?'同房已有男性':'同房已有女性';
    blk.querySelectorAll('.bc.avail').forEach(bed=>{
      const bi=bed.querySelector('.bi');
      if(bi&&!bi.querySelector('.rg-tag')){
        const tag=document.createElement('div');
        tag.className='rg-tag '+g;
        tag.textContent=label;
        bi.appendChild(tag);
      }
    });
  });
}
// 新增排床彈窗（bp2 pill 列表）：依「選擇個案」下拉選單選定的個案性別，即時鎖定/解鎖同房已有異性住客的空床 pill
const CASE_GENDER={p1:'m',p2:'f',p3:'m',h1:'m',g1:'f',g2:'m',t1:'m'};
let selectedCaseGender=null;
function applyPillGenderLock(){
  let anyBlocked=false;
  document.querySelectorAll('#m-case .bp2 .bpc').forEach(el=>{
    if(el.dataset.origTk==='1') return;
    const roomNo=el.textContent.trim().split('-')[0];
    const genders=getRoomGenders(roomNo);
    const blocked=!!selectedCaseGender&&genders.size>0&&!genders.has(selectedCaseGender);
    if(blocked){
      if(el.classList.contains('pk')) document.getElementById('selb').textContent='尚未選擇';
      el.classList.remove('av','pk');
      el.classList.add('tk');
      anyBlocked=true;
    } else {
      el.classList.remove('tk');
      if(!el.classList.contains('pk')) el.classList.add('av');
    }
  });
  const hint=document.getElementById('pill-gender-hint');
  if(hint) hint.classList.toggle('hidden',!anyBlocked);
}

// ── 確認排床：測試個案走完整資料搬移示範流程，其餘個案維持原本寫死的提示 ──
function confirmSchedule(){
  if(waitlistCtx){ confirmWaitlist(); return; }
  const csel=document.getElementById('csel');
  if(csel&&csel.value==='t1'){ scheduleTestCase(); return; }
  if(!csel||!csel.value){ alert('請選擇待排床個案'); return; }
  if(!document.getElementById('admdate').value){ alert('請選擇預計入院日期'); return; }
  const selb=document.getElementById('selb').textContent;
  if(!selb||selb==='尚未選擇'){ alert('請選擇床位'); return; }
  const caseName=csel.options[csel.selectedIndex].textContent.split('・')[0];
  const disVal=document.getElementById('disdate').value;
  closeModal('m-case');
  alert('排床已確認：'+caseName+' → '+selb+(disVal?'，預計出院 '+disVal:''));
}
function scheduleTestCase(){
  closeModal('m-case');
  const pendRow=document.getElementById('pend-row-t1');
  if(pendRow){
    const next=pendRow.nextElementSibling;
    if(next&&next.classList.contains('xrow')) next.remove();
    pendRow.remove();
  }
  const pendBadge=document.getElementById('badge-pending');
  if(pendBadge) pendBadge.textContent=Math.max(0,(parseInt(pendBadge.textContent,10)||0)-1);
  const resBody=document.getElementById('reserved-body');
  if(resBody){
    const empty=document.getElementById('reserved-empty');
    if(empty) empty.remove();
    const xtr=document.createElement('tr');
    xtr.id='xtest';
    xtr.className='xrow hidden';
    xtr.innerHTML="<td colspan='11'><div class='xc'><div class='xf'><label>病歷號</label><span>00099999</span></div><div class='xf'><label>主治醫師</label><span>許醫師（骨科）</span></div><div class='xf'><label>PAC療程</label><span>脆弱性骨折・14天（2週）・預計出院 2026/07/11</span></div><div class='xf'><label>家屬</label><span>陳小華（女兒）</span></div><div class='xf'><label>家屬電話</label><span>0966-777-888 <button class=\"btn btn-xs bg\" onclick=\"alert('已複製')\">複製</button></span></div><div class='xf'><label>房型配對</label><span>無偏好（雙人房）</span></div><div class='xf'><label>轉介來源</label><span>自收</span></div></div><div class='xact'><button class=\"btn bg btn-xs\" onclick=\"alert('前往個案管理：排床測試')\">前往個案管理 →</button><button class=\"btn bp btn-xs\" onclick=\"admitTestCase()\">確認入院</button></div><div class='xf' style='margin-top:10px'><label>備註</label></div><textarea class='xnote' placeholder='點擊輸入備註…'></textarea></td>";
    const tr=document.createElement('tr');
    tr.id='adm-row-610-B';
    tr.setAttribute('data-referral','自收');
    tr.setAttribute('onclick',"toggleX('xtest')");
    tr.innerHTML="<td><button class='xb' id='xbtest'>▶</button></td><td><strong>排床測試</strong></td><td>68歲 男</td><td><span class='tt-pac'>PAC</span></td><td>脆弱性骨折</td><td><strong>610-B</strong> <span style='font-size:10px;color:var(--gray-400)'>（雙人）</span></td><td>無偏好</td><td>2026/06/27</td><td>2026/07/11</td><td>林美惠</td><td><button class=\"btn bp btn-xs\" onclick=\"event.stopPropagation();admitTestCase()\">確認入院</button></td>";
    resBody.insertBefore(xtr,resBody.firstChild);
    resBody.insertBefore(tr,resBody.firstChild);
  }
  const resBadge=document.getElementById('badge-reserved');
  if(resBadge) resBadge.textContent=(parseInt(resBadge.textContent,10)||0)+1;
  applyCaseFilter();
  alert('排床已確認：排床測試 → 610-B，預計出院 2026/07/11');
}
// ── 確認入院（測試個案）：沿用既有 admitByBedNo 更新床位卡片樣式並移除已預約列，再於住院中新增一列並串接既有出院流程 ──
function admitTestCase(){
  admitByBedNo('610-B');
  const resBadge=document.getElementById('badge-reserved');
  if(resBadge) resBadge.textContent=Math.max(0,(parseInt(resBadge.textContent,10)||0)-1);
  const resBody=document.getElementById('reserved-body');
  if(resBody&&!resBody.children.length){
    const tr=document.createElement('tr');
    tr.id='reserved-empty';
    tr.style.cursor='default';
    tr.innerHTML="<td colspan='11' style='text-align:center;color:var(--gray-400);padding:14px'>目前沒有其他已預約個案</td>";
    resBody.appendChild(tr);
  }
  const hospBody=document.getElementById('hosp-body');
  if(hospBody){
    const xtr=document.createElement('tr');
    xtr.id='xtest2';
    xtr.className='xrow hidden';
    xtr.innerHTML="<td colspan='11'><div class='xc'><div class='xf'><label>病歷號</label><span>00099999</span></div><div class='xf'><label>主治醫師</label><span>許醫師（骨科）</span></div><div class='xf'><label>照護週數</label><span>第 1 週 / 2 週</span></div><div class='xf'><label>家屬</label><span>陳小華（女兒）</span></div><div class='xf'><label>家屬電話</label><span>0966-777-888 <button class=\"btn btn-xs bg\" onclick=\"alert('已複製')\">複製</button></span></div><div class='xf'><label>房型</label><span>雙人房（610病室）</span></div><div class='xf'><label>轉介來源</label><span>自收</span></div></div><div class='xact'><button class=\"btn bg btn-xs\" onclick=\"openModal('m-edit')\">編輯排床</button><button class=\"btn bd btn-xs\" onclick=\"openDischargeConfirm(null,'610-B','排床測試')\">確認出院</button></div><div class='xf' style='margin-top:10px'><label>備註</label></div><textarea class='xnote' placeholder='點擊輸入備註…'></textarea></td>";
    const tr=document.createElement('tr');
    tr.setAttribute('data-referral','自收');
    tr.setAttribute('onclick',"toggleX('xtest2')");
    tr.innerHTML="<td><button class='xb' id='xbtest2'>▶</button></td><td><strong>排床測試</strong></td><td>68歲 男</td><td><span class='tt-pac'>PAC</span></td><td>脆弱性骨折</td><td><strong>610-B</strong></td><td>00099999</td><td>2026/06/27</td><td>2026/07/11</td><td>—</td><td><button class=\"btn bd btn-xs\" onclick=\"event.stopPropagation();openDischargeConfirm(null,'610-B','排床測試')\">確認出院</button></td>";
    hospBody.insertBefore(xtr,hospBody.firstChild);
    hospBody.insertBefore(tr,hospBody.firstChild);
  }
  applyCaseFilter();
}

// ── m-case 彈窗依入口預填：從空床點擊→鎖定床位待選個案；從個案列表「安排床位」→帶入個案待選床位；主按鈕→兩者皆空 ──
function resetCaseModal(){
  const csel=document.getElementById('csel');
  if(csel) csel.value='';
  document.getElementById('cprev').classList.add('hidden');
  document.getElementById('rwarn').classList.add('hidden');
  document.getElementById('admdate').value='';
  bedPickMode='gate';
  document.getElementById('bedpick-gate').classList.remove('hidden');
  document.getElementById('bedpick-locked').classList.add('hidden');
  document.getElementById('bedpick-full').classList.add('hidden');
  document.getElementById('bedpick-rooms').classList.add('hidden');
  resetRoomPickState();
  document.getElementById('csel-locked').classList.add('hidden');
  document.getElementById('csel-full').classList.remove('hidden');
  document.querySelectorAll('#m-case .bpc.pk').forEach(c=>c.classList.remove('pk'));
  document.getElementById('selb').textContent='尚未選擇';
  selectedCaseGender=null;
  applyPillGenderLock();
  waitlistCtx=null;
  const wHint=document.getElementById('waitlist-hint');
  if(wHint){ wHint.classList.add('hidden'); wHint.textContent=''; }
  const confirmBtn=document.getElementById('btn-case-confirm');
  if(confirmBtn) confirmBtn.textContent='確認排床';
}
// 床位選擇的三種模式：gate（尚未選日期，鎖住不可選床）／full（一般 pill 格子挑床）／rooms（病室分組列表挑床）／locked（床位或候補流程已鎖定特定床，略過日期門檻）
let bedPickMode='gate';
function onAdmDateChange(){
  const hasDate=!!document.getElementById('admdate').value;
  if(bedPickMode==='locked') return; // 已鎖定特定床位的流程（從空床/個案/候補進入）不受日期門檻影響
  document.getElementById('bedpick-gate').classList.toggle('hidden',hasDate);
  document.getElementById('bedpick-full').classList.toggle('hidden',!(hasDate&&bedPickMode==='full'));
  document.getElementById('bedpick-rooms').classList.toggle('hidden',!(hasDate&&bedPickMode==='rooms'));
}
function openBedModal(bedNo,roomType){
  resetCaseModal();
  bedPickMode='locked';
  document.getElementById('bedpick-gate').classList.add('hidden');
  document.getElementById('bedpick-full').classList.add('hidden');
  document.getElementById('bedpick-locked').classList.remove('hidden');
  document.getElementById('bedpick-locked-text').textContent=bedNo+'（'+roomType+'）';
  document.getElementById('selb').textContent=bedNo+'（'+roomType+'）';
  openModal('m-case');
}
function reopenBedPicker(){
  document.getElementById('bedpick-locked').classList.add('hidden');
  bedPickMode='full';
  onAdmDateChange();
}
function openCaseModal(caseId){
  resetCaseModal();
  const csel=document.getElementById('csel');
  if(csel){csel.value=caseId;onCS(caseId);}
  document.getElementById('csel-full').classList.add('hidden');
  document.getElementById('csel-locked').classList.remove('hidden');
  const opt=csel?csel.querySelector('option[value="'+caseId+'"]'):null;
  document.getElementById('csel-locked-text').textContent=opt?opt.textContent:'';
  bedPickMode='rooms';
  openModal('m-case');
}
// ── 第三種入口：從展延／住院中個案「預排下一位」發起候補，床位鎖定為該個案目前使用中的床，選擇個案維持一般下拉選單 ──
let waitlistCtx=null;
function openWaitlistModal(bedNo,occupantName,dischargeDateText){
  resetCaseModal();
  bedPickMode='locked';
  document.getElementById('bedpick-gate').classList.add('hidden');
  document.getElementById('bedpick-full').classList.add('hidden');
  document.getElementById('bedpick-locked').classList.remove('hidden');
  document.getElementById('bedpick-locked-text').textContent=bedNo;
  document.getElementById('selb').textContent=bedNo;
  waitlistCtx={bedNo,occupantName,dischargeDateText};
  const hint=document.getElementById('waitlist-hint');
  hint.textContent=(dischargeDateText&&dischargeDateText!=='—')
    ?'預計 '+dischargeDateText+'（'+occupantName+' 出院日）後可入住'
    :occupantName+' 預計出院日尚未確定，可入住時間需另行評估';
  hint.classList.remove('hidden');
  const confirmBtn=document.getElementById('btn-case-confirm');
  if(confirmBtn) confirmBtn.textContent='確認候補';
  openModal('m-case');
}
// 病室分組列表（僅 openCaseModal 入口使用）：點摘要列展開／收合，一次只展開一間病室
function toggleRoomPickList(el){
  const beds=el.nextElementSibling;
  const wasHidden=beds.classList.contains('hidden');
  document.querySelectorAll('#bedpick-rooms .rp-beds').forEach(b=>b.classList.add('hidden'));
  beds.classList.toggle('hidden',!wasHidden);
}
// 選擇病室內某張可選床位：標記選取狀態、更新摘要列文字、收合回摘要列
function selRoomBed(el,roomNo,letter,roomType){
  document.querySelectorAll('#bedpick-rooms .rp-bed.pk').forEach(b=>b.classList.remove('pk'));
  el.classList.add('pk');
  const bedNo=roomNo+'-'+letter;
  document.getElementById('selb').textContent=bedNo+'（'+roomType+'）';
  const room=el.closest('.rp-room');
  document.querySelectorAll('#bedpick-rooms .rp-room.rp-selected').forEach(r=>{
    if(r!==room) restoreRoomPickSummary(r);
  });
  room.classList.add('rp-selected');
  const summaryText=room.querySelector('.rp-summary-text');
  if(!summaryText.dataset.orig) summaryText.dataset.orig=summaryText.textContent;
  summaryText.textContent='✓ 已在此病室選床：'+bedNo;
  room.querySelector('.rp-beds').classList.add('hidden');
}
function restoreRoomPickSummary(room){
  room.classList.remove('rp-selected');
  const summaryText=room.querySelector('.rp-summary-text');
  if(summaryText.dataset.orig) summaryText.textContent=summaryText.dataset.orig;
  room.querySelectorAll('.rp-bed.pk').forEach(b=>b.classList.remove('pk'));
}
function resetRoomPickState(){
  document.querySelectorAll('#bedpick-rooms .rp-beds').forEach(b=>b.classList.add('hidden'));
  document.querySelectorAll('#bedpick-rooms .rp-room').forEach(r=>restoreRoomPickSummary(r));
}
// 病室卡片檢視的空床格：自動從所在 room-blk 讀出床號／房型，交給 openBedModal
function openBedModalFromEl(el){
  const blk=el.closest('.room-blk');
  const roomNoEl=blk.querySelector('.room-no');
  const roomNo=roomNoEl.childNodes[0].textContent.trim();
  const roomType=roomNoEl.querySelector('span').textContent.trim();
  const bedLetter=el.querySelector('.bl').textContent.trim();
  openBedModal(roomNo+'-'+bedLetter,roomType);
}
// 列表視圖「安排入住」空床列：從該列讀出床號／房型，交給 openBedModal
function openBedModalFromRow(el){
  const tds=el.children;
  const bedNo=tds[0].textContent.trim();
  const roomType=tds[2].textContent.trim()+'房';
  openBedModal(bedNo,roomType);
}

// ── 確認入院：床位狀態改為住院中（找出病室卡片檢視中對應床位並更新樣式／點擊行為），移除今日入院列表中的該列 ──
function admitByBedNo(bedNo){
  if(!confirm('確認個案已入院，床位 '+bedNo+' 狀態更新為住院中？')) return;
  document.querySelectorAll('#vgrid .bc').forEach(el=>{
    const blk=el.closest('.room-blk');
    if(!blk) return;
    const roomNo=blk.querySelector('.room-no').childNodes[0].textContent.trim();
    const letter=el.querySelector('.bl');
    if(!letter) return;
    if(roomNo+'-'+letter.textContent.trim()===bedNo){
      el.classList.remove('sin','sou','td','today-in','avail');
      el.setAttribute('onclick',"openModal('m-dpac')");
      const sub=el.querySelector('.bd2');
      if(sub) sub.textContent='住院中';
    }
  });
  const row=document.getElementById('adm-row-'+bedNo);
  if(row){
    const next=row.nextElementSibling;
    if(next&&next.classList.contains('xrow')) next.remove();
    row.remove();
  }
  const badge=document.getElementById('badge-today-in');
  if(badge) badge.textContent=Math.max(0,(parseInt(badge.textContent,10)||0)-1);
  closeModal('m-dres');
  alert('已確認入院，床位狀態更新為住院中');
}

// ── 確認出院子流程：備註＋床位後續狀態選擇，確認後更新空床統計、將個案從住院中／今日出院移到已出院分區 ──
let dischargeCtx=null;
function openDischargeConfirm(sourceModalId,bedNo,caseName){
  dischargeCtx={sourceModalId,bedNo,caseName,option:'avail'};
  document.getElementById('discharge-info').textContent='床位：'+bedNo+'・個案：'+caseName;
  document.getElementById('discharge-note').value='';
  updateDischargeOptionUI();
  openModal('m-discharge');
}
function selectDischargeOption(opt){
  dischargeCtx.option=opt;
  updateDischargeOptionUI();
}
function updateDischargeOptionUI(){
  document.getElementById('discharge-opt-avail').classList.toggle('sel',dischargeCtx.option==='avail');
  document.getElementById('discharge-opt-clean').classList.toggle('sel',dischargeCtx.option==='clean');
}
function confirmDischarge(){
  const {sourceModalId,bedNo,caseName,option}=dischargeCtx;
  const label=option==='avail'?'可使用':'清潔中';
  if(option==='avail'){
    const el=document.getElementById('sc-avail');
    if(el) el.textContent=(parseInt(el.textContent,10)||0)+1;
  }
  moveCaseToDischarged(bedNo,caseName);
  updateVListAvailability(bedNo,option);
  closeModal('m-discharge');
  if(sourceModalId) closeModal(sourceModalId);
  alert('已確認出院，床位已釋出並標記為'+label);
  handleWaitlistOnDischarge(bedNo);
}
// 從住院中／今日出院列表移除該筆個案的列（含展開列），並在已出院表格頂部新增一列簡易紀錄
function moveCaseToDischarged(bedNo,caseName){
  ['hosp-body','today-out-body','extend-body'].forEach(bodyId=>{
    const body=document.getElementById(bodyId);
    if(!body) return;
    const row=[...body.querySelectorAll('tr')].find(r=>r.textContent.includes(caseName)&&!r.classList.contains('xrow'));
    if(row){
      const next=row.nextElementSibling;
      if(next&&next.classList.contains('xrow')) next.remove();
      row.remove();
    }
  });
  const extBadge=document.getElementById('badge-extend');
  if(extBadge&&document.getElementById('extend-body')){
    extBadge.textContent=Math.max(0,[...document.getElementById('extend-body').children].filter(r=>!r.classList.contains('xrow')).length);
  }
  const outBadge=document.getElementById('badge-today-out');
  if(outBadge&&document.getElementById('today-out-body')&&![...document.getElementById('today-out-body').children].length){
    outBadge.textContent='0';
  }
  const dBody=document.getElementById('discharged-body');
  const dBadge=document.getElementById('badge-discharged');
  if(dBody){
    const tr=document.createElement('tr');
    tr.className='done';
    tr.setAttribute('data-referral','—');
    tr.setAttribute('data-onset','—');
    tr.setAttribute('data-doctor','—');
    tr.setAttribute('data-dept','—');
    tr.setAttribute('data-family','—');
    tr.setAttribute('data-relation','—');
    tr.setAttribute('data-phone','—');
    tr.setAttribute('data-roompref','—');
    tr.innerHTML='<td></td><td><strong>'+caseName+'</strong></td><td>—</td><td>—</td><td>—</td><td>'+bedNo+'</td><td>—</td><td>—</td><td>2026/06/25</td><td>今日確認出院</td>';
    dBody.insertBefore(tr,dBody.firstChild);
    renderDischargedRow(tr);
  }
  if(dBadge) dBadge.textContent=(parseInt(dBadge.textContent,10)||0)+1;
}
// ── 滯留原因標記：住院中／展延個案若預計出院已逾期卻遲遲無法出院，供個管師標記「出不去的原因」，純視覺標籤，不觸發分區搬移 ──
const STUCK_REASONS=['等待轉院','家屬未決定','健保資格問題','等待養護機構床位','其他'];
function markStuckReason(xid,name){
  const menu=STUCK_REASONS.map((r,i)=>(i+1)+'. '+r).join('\n');
  const input=prompt('請選擇「'+name+'」的滯留原因（輸入數字 1-'+STUCK_REASONS.length+'）：\n'+menu);
  if(input===null) return;
  const idx=parseInt(input,10)-1;
  if(isNaN(idx)||idx<0||idx>=STUCK_REASONS.length){ alert('請輸入有效的選項數字'); return; }
  const reason=STUCK_REASONS[idx];
  const btn=document.getElementById('stuck-btn-'+xid);
  if(btn) btn.textContent='已標記：'+reason;
  const xrow=document.getElementById(xid);
  const mainRow=xrow?xrow.previousElementSibling:null;
  if(mainRow){
    const nameCell=mainRow.children[1];
    let tag=nameCell?nameCell.querySelector('.stuck-tag'):null;
    if(!tag&&nameCell){
      tag=document.createElement('span');
      tag.className='stuck-tag';
      nameCell.appendChild(document.createTextNode(' '));
      nameCell.appendChild(tag);
    }
    if(tag) tag.textContent='滯留：'+reason;
  }
}

// ══ 候補中：個管師可在個案仍在住院／展延期間，先為其他個案預先卡位同一張床，該床出院時主動提示是否讓候補個案接手 ══

// 待排床列表目前唯一有固定 DOM id 可循的四筆（測試個案 t1、PAC p1-p3），供候補確認／取消候補時原樣移除／復原該列
const PENDING_ROW_ID={t1:'t1',p1:'1',p2:'2',p3:'3'};
// 候補確認當下，從待排床移除的原始列（含展開列）依目標床號暫存，取消候補時原樣插回，確保「不指定任何目標床位」的欄位內容不失真
let waitlistOriginalRows={};

function removePendingRow(caseId,bedNo){
  const suffix=PENDING_ROW_ID[caseId];
  if(!suffix) return;
  const btn=document.getElementById('xb'+suffix);
  const mainRow=btn?btn.closest('tr'):null;
  if(!mainRow) return;
  const next=mainRow.nextElementSibling;
  const xrow=(next&&next.classList.contains('xrow'))?next:null;
  if(xrow) xrow.remove();
  mainRow.remove();
  waitlistOriginalRows[bedNo]={mainRow,xrow};
  const badge=document.getElementById('badge-pending');
  if(badge) badge.textContent=Math.max(0,(parseInt(badge.textContent,10)||0)-1);
}
function restorePendingRow(bedNo){
  const saved=waitlistOriginalRows[bedNo];
  if(!saved) return; // 候補若非由既有待排床個案轉入（例如示範用種子資料），沒有原始列可還原，故不動作，避免徽章計數與實際列數不一致
  const body=document.getElementById('pending-body');
  if(body){
    body.insertBefore(saved.mainRow,body.firstChild);
    if(saved.xrow) body.insertBefore(saved.xrow,saved.mainRow.nextSibling);
  }
  delete waitlistOriginalRows[bedNo];
  const badge=document.getElementById('badge-pending');
  if(badge) badge.textContent=(parseInt(badge.textContent,10)||0)+1;
}

// 床位卡片候補圖示：標記／移除目標床位上的排隊提示（🟣）
function markBedWaiting(bedNo,on){
  document.querySelectorAll('#vgrid .bc').forEach(el=>{
    const blk=el.closest('.room-blk');
    if(!blk) return;
    const roomNo=blk.querySelector('.room-no').childNodes[0].textContent.trim();
    const letter=el.querySelector('.bl');
    if(!letter) return;
    if(roomNo+'-'+letter.textContent.trim()===bedNo) el.classList.toggle('waiting',on);
  });
}

let waitlistSeq=0;
function addWaitlistRow(name,ageGender,bedNo,occupantName,moveinDateText){
  const body=document.getElementById('waiting-body');
  if(!body) return;
  waitlistSeq++;
  const tr=document.createElement('tr');
  tr.id='wait-row-'+waitlistSeq;
  tr.dataset.bed=bedNo;
  tr.dataset.candidate=name;
  tr.dataset.movein=moveinDateText;
  tr.dataset.source='排床模組建立'; // 透過候補彈窗（選自待排床既有個案）建立，非收案管理模組匯入個案
  tr.innerHTML="<td><strong>"+name+"</strong></td><td>"+ageGender+"</td><td><strong>"+bedNo+"</strong></td><td>"+occupantName+"</td><td>"+moveinDateText+"</td><td>—</td><td><button class=\"btn bd btn-xs\" onclick=\"cancelWaitlist(this)\">取消候補</button></td>";
  body.appendChild(tr);
  const badge=document.getElementById('badge-waiting');
  if(badge) badge.textContent=(parseInt(badge.textContent,10)||0)+1;
}
function removeWaitlistRow(row){
  row.remove();
  const body=document.getElementById('waiting-body');
  const badge=document.getElementById('badge-waiting');
  if(badge&&body) badge.textContent=body.children.length;
}

// ── 確認候補（m-case 彈窗第三種入口的確認按鈕）：新增候補中列、將候補個案自待排床移除、標記床位候補圖示 ──
function confirmWaitlist(){
  const csel=document.getElementById('csel');
  const caseId=csel?csel.value:'';
  if(!caseId){ alert('請選擇要候補此床位的個案'); return; }
  const opt=csel.querySelector('option[value="'+caseId+'"]');
  const label=opt?opt.textContent:'';
  const name=label.split('・')[0]||label;
  const m=label.match(/[（(]([^）)]+)[）)]/);
  const ageGender=m?m[1].replace(/歲(?=[男女])/,'歲 '):'—';
  const {bedNo,occupantName,dischargeDateText}=waitlistCtx;
  addWaitlistRow(name,ageGender,bedNo,occupantName,dischargeDateText);
  removePendingRow(caseId,bedNo);
  markBedWaiting(bedNo,true);
  closeModal('m-case');
  alert('已將 '+name+' 加入候補名單，目標床位 '+bedNo+'（'+occupantName+' 預計 '+(dischargeDateText==='—'?'尚未確定日期':dischargeDateText+' 出院')+'後可入住）');
}

// ── 取消候補：候補中列移除、床位候補圖示移除、候補個案恢復為一般待排床狀態（不指定目標床位）──
function cancelWaitlist(btn){
  const row=btn.closest('tr');
  const bedNo=row.dataset.bed,candidate=row.dataset.candidate;
  if(!confirm('確定要取消「'+candidate+'」候補床位 '+bedNo+' 嗎？取消後將恢復為一般待排床狀態')) return;
  markBedWaiting(bedNo,false);
  removeWaitlistRow(row);
  restorePendingRow(bedNo);
}

// ── 展延通過「確認新日期」：更新預計出院日之外，若該床有候補個案在等，額外提醒展延將影響其預計入住時間 ──
function confirmNewDischargeDate(bedNo,newDateText){
  alert('預計出院日已更新為 '+newDateText+'，已同步個案管理');
  const row=[...document.querySelectorAll('#waiting-body tr')].find(r=>r.dataset.bed===bedNo);
  if(row) alert('此床位有候補個案 '+row.dataset.candidate+' 在等待，展延將影響其預計入住時間，請自行評估是否需要通知');
}

// ── 出院確認完成後的候補銜接：判斷該床是否有候補個案，詢問是否立即安排入住 ──
function handleWaitlistOnDischarge(bedNo){
  const row=[...document.querySelectorAll('#waiting-body tr')].find(r=>r.dataset.bed===bedNo);
  if(!row) return;
  const candidate=row.dataset.candidate,movein=row.dataset.movein;
  const ageGender=row.children[1].textContent;
  markBedWaiting(bedNo,false); // 床已釋出，候補提醒的階段性任務已完成，無論是否立即安排都要移除圖示，避免誤以為床仍被鎖定
  const proceed=confirm('床位 '+bedNo+' 已釋出，候補個案 '+candidate+' 可以入住，是否要立即為其安排入住？');
  if(!proceed) return; // 候補個案維持留在候補中表格，不做其他處理
  removeWaitlistRow(row);
  if(movein==='2026/06/25') addTodayInRow(candidate,ageGender,bedNo,movein);
  else addReservedRow(candidate,ageGender,bedNo,movein);
}
// 由候補名單轉入「已預約」：沿用一般已預約列格式，個管師／房型等細節留待後續於個案管理補齊
function addReservedRow(name,ageGender,bedNo,moveinDateText){
  const body=document.getElementById('reserved-body');
  if(!body) return;
  const empty=document.getElementById('reserved-empty');
  if(empty) empty.remove();
  const suffix='res-'+bedNo,xid='x'+suffix;
  const tr=document.createElement('tr');
  tr.id='adm-row-'+bedNo;
  tr.setAttribute('onclick',"toggleX('"+xid+"')");
  tr.innerHTML="<td><button class='xb' id='xb"+suffix+"'>▶</button></td><td><strong>"+name+"</strong></td><td>"+ageGender+"</td><td><span class='tt-pac'>PAC</span></td><td>—</td><td><strong>"+bedNo+"</strong></td><td>無偏好</td><td>"+moveinDateText+"</td><td>—</td><td>—</td><td><button class=\"btn bp btn-xs\" onclick=\"event.stopPropagation();admitFromReserved('"+bedNo+"')\">確認入院</button></td>";
  const xtr=document.createElement('tr');
  xtr.id=xid;
  xtr.className='xrow hidden';
  xtr.innerHTML="<td colspan='11'><div style='font-size:12px;color:var(--gray-500);padding:4px 0'>由候補名單轉入，原候補目標床位："+bedNo+"</div></td>";
  body.insertBefore(xtr,body.firstChild);
  body.insertBefore(tr,body.firstChild);
  const badge=document.getElementById('badge-reserved');
  if(badge) badge.textContent=(parseInt(badge.textContent,10)||0)+1;
}
// 已預約列的「確認入院」比照 admitTestCase() 的作法：admitByBedNo 本身只會扣今日入院計數，故需額外補扣已預約計數／補回空狀態列
function admitFromReserved(bedNo){
  admitByBedNo(bedNo);
  const badge=document.getElementById('badge-reserved');
  if(badge) badge.textContent=Math.max(0,(parseInt(badge.textContent,10)||0)-1);
  // admitByBedNo 內部一律誤扣「今日入院」計數（沿用既有 admitTestCase 的已知限制），此列來自已預約，需補回避免計數失真
  const todayInBadge=document.getElementById('badge-today-in');
  if(todayInBadge) todayInBadge.textContent=(parseInt(todayInBadge.textContent,10)||0)+1;
  const body=document.getElementById('reserved-body');
  if(body&&!body.children.length){
    const tr=document.createElement('tr');
    tr.id='reserved-empty';
    tr.style.cursor='default';
    tr.innerHTML="<td colspan='11' style='text-align:center;color:var(--gray-400);padding:14px'>目前沒有其他已預約個案</td>";
    body.appendChild(tr);
  }
}
// 由候補名單轉入「今日入院」：預計可入住日期即為今日
function addTodayInRow(name,ageGender,bedNo,moveinDateText){
  const body=document.getElementById('today-in-body');
  if(!body) return;
  const suffix='res-'+bedNo,xid='x'+suffix;
  const tr=document.createElement('tr');
  tr.id='adm-row-'+bedNo;
  tr.setAttribute('onclick',"toggleX('"+xid+"')");
  tr.innerHTML="<td><button class='xb' id='xb"+suffix+"'>▶</button></td><td><strong>"+name+"</strong></td><td>"+ageGender+"</td><td><span class='tt-pac'>PAC</span></td><td>—</td><td><strong>"+bedNo+"</strong></td><td>無偏好</td><td>"+moveinDateText+"</td><td>—</td><td>—</td><td><button class=\"btn bp btn-xs\" onclick=\"event.stopPropagation();admitByBedNo('"+bedNo+"')\">確認入院</button></td>";
  const xtr=document.createElement('tr');
  xtr.id=xid;
  xtr.className='xrow hidden';
  xtr.innerHTML="<td colspan='11'><div style='font-size:12px;color:var(--gray-500);padding:4px 0'>由候補名單轉入，原候補目標床位："+bedNo+"</div></td>";
  body.insertBefore(xtr,body.firstChild);
  body.insertBefore(tr,body.firstChild);
  const badge=document.getElementById('badge-today-in');
  if(badge) badge.textContent=(parseInt(badge.textContent,10)||0)+1;
}
function switchNcTab(el,id){el.closest('.mb').querySelectorAll('.mtab').forEach(t=>t.classList.remove('active'));el.classList.add('active');['nc-m','nc-h','nc-i'].forEach(i=>{const e=document.getElementById(i);if(e)e.classList.toggle('hidden',i!==id);});}
// 供「切換至手動建立」等非 .mtab 觸發點使用：不需要既有 el 參照即可切換 nc-* tab
function goToNcTab(id){
  const tabs=['nc-m','nc-h','nc-i'];
  const idx=tabs.indexOf(id);
  document.querySelectorAll('#m-newcase .mtab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  tabs.forEach(i=>{const e=document.getElementById(i);if(e)e.classList.toggle('hidden',i!==id);});
}
function onNcT(v){document.getElementById('nc-pd').style.display=v==='p'?'flex':'none';document.getElementById('nc-gd').style.display=v==='g'?'flex':'none';}
// 杏翔帶入查詢：僅測試病歷號 00073450 視為查得到資料，其餘一律視為查無資料
function showHis(){
  const val=(document.getElementById('his-no').value||'').trim();
  const found = val==='00073450';
  document.getElementById('hisres').classList.toggle('hidden',!found);
  document.getElementById('hisres-fail').classList.toggle('hidden',found);
}
function openModal(id){document.getElementById(id).classList.remove('hidden');}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
document.querySelectorAll('.mo').forEach(o=>o.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden');}));

// ══ 床位總覽列表視圖(vlist)：病房類型／展延五狀態／預計可用欄位＋整體重構為可展開列 ══

// 病房類型對照（病室層級標籤，與個案照護分類「PAC/一般/安寧」分開顯示，純視覺分類不影響流程邏輯）；未列出的病室顯示「—」
const ROOM_TYPE_MAP={
  '301':'PAC','303':'復健病房','308':'一般復健','312':'骨科',
  '501':'PAC','505':'家醫科','606':'神外','612':'安寧',
};
function roomTypeCell(roomNo){
  const label=ROOM_TYPE_MAP[roomNo];
  return label?`<span class="room-pb" style="position:static;display:inline-block">${label}</span>`:'<span style="color:var(--gray-300)">—</span>';
}

// 展延五狀態（沿用個案管理模組邏輯）：待申請／審核中／同意展延／不同意展延／不需展延；非 PAC 個案一律「—」
const BED_EXT_STATUS={
  '301-A':{state:'待申請',days:3},
  '301-B':{state:'同意展延',weeks:2},
  '303-B':{state:'審核中'},
  '305-B':{state:'不同意展延'},
};
function extBadgeHtml(state,opts){
  opts=opts||{};
  if(state==='待申請') return `<span class="exb exp">待申請${opts.days!=null?`（剩餘${opts.days}天）`:''}</span>`;
  if(state==='審核中') return `<span class="exb exr">審核中</span>`;
  if(state==='同意展延') return `<span class="exb exg">同意展延${opts.weeks!=null?`（展延${opts.weeks}週）`:''}</span>`;
  if(state==='不同意展延') return `<span class="exb exd">不同意展延</span>`;
  if(state==='不需展延') return `<span class="exb exn">不需展延</span>`;
  return '<span style="color:var(--gray-300)">—</span>';
}
function vlistExtCell(bedNo,isPacHosp){
  if(!isPacHosp) return '<span style="color:var(--gray-300)">—</span>';
  const demo=BED_EXT_STATUS[bedNo];
  return demo?extBadgeHtml(demo.state,demo):extBadgeHtml('不需展延');
}

// 預計可用：已走完確認出院流程且選「可使用」＝出院日當天；選「清潔中」＝出院日隔天；尚未觸發確認出院流程時暫比照「可使用」邏輯（＝預計出院日當天）
function computeAvailDate(bedStatus,dischargeText){
  if(bedStatus==='可使用') return '已可用';
  if(bedStatus==='清潔維修'||bedStatus==='包房') return '—';
  if(!dischargeText||dischargeText==='—') return '—';
  return dischargeText;
}
// 實際觸發確認出院流程後，依個管師選擇的床位後續狀態更新該床「預計可用」欄位
function updateVListAvailability(bedNo,option){
  const cell=document.querySelector('#vlist td.avail-cell[data-bed="'+bedNo+'"]');
  if(!cell) return;
  cell.textContent=option==='avail'?'2026/06/25':'2026/06/26';
}

// 已知床位的豐富資料（目前入住者／已預約個案），供展開列使用；未列出的床位以該列既有欄位資料呈現一般版本，不虛構完整假資料
const BED_RICH_DATA={
  '301-A':{occupant:{onset:'2026/06/08',hospDays:'17天(4週)',source:'員基轉入',doctor:'王主任（神經內科）',dept:'神經內科',family:'李大明',relation:'兒子',phone:'0912-345-678',roomPref:'雙人房（配對：否）'}},
  '301-B':{occupant:{onset:'2026/05/26',hospDays:'45天(2+2週)',source:'自收',doctor:'陳醫師（復健科）',dept:'復健科',family:'鄭小芳',relation:'配偶',phone:'0956-123-456',roomPref:'雙人房（配對：是）'}},
  '303-A':{reserved:{onset:'2026/06/24',source:'彰基轉入',doctor:'王主任（神經內科）',dept:'神經內科',family:'陳小明',relation:'兒子',phone:'0912-345-678',roomPref:'單人房（配對：否）'}},
  '303-B':{occupant:{onset:'2026/06/14',hospDays:'11天(3週)',source:'彰基轉入',doctor:'王主任（神經內科）',dept:'神經內科',family:'吳建志',relation:'兒子',phone:'0967-234-567',roomPref:'雙人房'}},
  '305-B':{occupant:{onset:'2026/06/20',hospDays:'18天(6週)',source:'彰基轉入',doctor:'林醫師（神經外科）',dept:'神經外科',family:'許小芬',relation:'女兒',phone:'0928-111-222',roomPref:'雙人房'}},
  '507-B':{reserved:{onset:'2026/06/22',source:'員基轉入',doctor:'林醫師（骨科）',dept:'骨科',family:'蔡小芳',relation:'女兒',phone:'0923-456-789',roomPref:'無偏好（雙人房）'}},
  '605-A':{occupant:{onset:'2026/06/09',hospDays:'46天(6+2週)',source:'其他醫院轉入',doctor:'趙醫師（外科）',dept:'外科',family:'張美惠',relation:'配偶',phone:'0912-999-888',roomPref:'無偏好'}},
  '309-A':{occupant:{onset:'2026/05/28',hospDays:'—',source:'居家轉住院',doctor:'李醫師（安寧科）',dept:'安寧科',family:'林大明',relation:'兒子',phone:'0978-345-678',roomPref:'無偏好'}},
  '512-B':{occupant:{onset:'2026/05/18',hospDays:'36天(已逾期)',source:'其他醫院轉入',doctor:'周醫師（內科）',dept:'內科',family:'蔡小玲',relation:'女兒',phone:'0933-222-111',roomPref:'無偏好'}},
};

// 展開列內容：依床位狀態顯示「目前入住」／「已預約（尚未入住）」／「下一位入院（候補中）」區塊，皆無資料時顯示單純空床提示
function fRow(pairs){
  return '<div class="bedvw-row">'+pairs.map(p=>'<div class="bedvw-f"><label>'+p[0]+'</label><span>'+(p[1]||'—')+'</span></div>').join('')+'</div>';
}
function buildBedExpandContent(info){
  const {bedNo,bedStatus,caseName,diseaseText,mrnText,dischargeText}=info;
  const rich=BED_RICH_DATA[bedNo]||{};
  const isOccupied=['PAC住院中','一般住院','安寧住院'].includes(bedStatus);
  const isReserved=bedStatus==='已預約';
  const waitTr=[...document.querySelectorAll('#waiting-body tr[data-bed]')].find(r=>r.dataset.bed===bedNo);

  let curBlock='',nextBlock='';
  if(isOccupied||isReserved){
    const o=(isOccupied?rich.occupant:rich.reserved)||{};
    const title=isOccupied?'目前入住：'+caseName:'已預約（尚未入住）：'+caseName;
    const actionBtn=isOccupied
      ? `<button class="btn bd btn-xs" onclick="event.stopPropagation();openDischargeConfirm(null,'${bedNo}','${caseName}')">確定出院</button>`
      : `<button class="btn bp btn-xs" onclick="event.stopPropagation();admitByBedNo('${bedNo}')">確定入院</button>`;
    curBlock=`<div class="bedvw-col"><div class="bedvw-title">${title}</div>
      ${fRow([['病歷號',mrnText],['發病日',o.onset],['住院天數',isOccupied?o.hospDays:null],['來源',o.source],['主治醫師',o.doctor],['科別',o.dept]])}
      ${fRow([['家屬',o.family],['關係',o.relation],['聯絡電話',o.phone],['房型偏好',o.roomPref]])}
      <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">備註</div><textarea class="xnote" placeholder="點擊輸入備註…"></textarea>
      <div class="xact" style="margin-top:10px">
        <button class="btn bg btn-xs" onclick="event.stopPropagation();alert('前往個案管理模組：${caseName}')">前往個案管理模組</button>
        ${actionBtn}
      </div></div>`;
  }
  if(waitTr){
    const cand=waitTr.dataset.candidate,movein=waitTr.dataset.movein,src=waitTr.dataset.source||'';
    const ageGender=waitTr.children[1]?waitTr.children[1].textContent:'';
    const canConfirmArrival=!isOccupied&&!isReserved;
    const canGoToCollection=src==='收案管理模組匯入';
    nextBlock=`<div class="bedvw-col"><div class="bedvw-title">下一位入院：${cand}</div>
      ${fRow([['姓名',cand+'（'+ageGender+'）'],['預計入院',movein]])}
      ${fRow([['病歷號','—'],['發病日','—']])}
      ${fRow([['家屬','—'],['來源','—'],['關係','—']])}
      ${fRow([['主治醫師','—'],['科別','—'],['聯絡電話','—'],['房型偏好','—']])}
      <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">備註</div><textarea class="xnote" placeholder="點擊輸入備註…"></textarea>
      <div class="xact" style="margin-top:10px">
        <button class="btn bp btn-xs" ${canConfirmArrival?'':'disabled style="opacity:.45;cursor:not-allowed"'} onclick="event.stopPropagation();handleWaitlistOnDischarge('${bedNo}')">確定報到</button>
        <button class="btn bg btn-xs" onclick="event.stopPropagation();adjustWaitlistFromVList('${bedNo}')">調整預排</button>
        <button class="btn bd btn-xs" onclick="event.stopPropagation();cancelWaitlistFromVList('${bedNo}')">取消預排</button>
        <button class="btn bg btn-xs" ${canGoToCollection?'':'disabled style="opacity:.45;cursor:not-allowed"'} onclick="event.stopPropagation();alert('前往收案管理模組：${cand}')">前往收案管理模組</button>
      </div></div>`;
  } else if(curBlock){
    // 這張床已有住客／已預約，但尚未安排下一位候補個案：提供「安排入住」按鈕直接開啟預排流程
    nextBlock=`<div class="bedvw-col"><div class="bedvw-title">下一位入院</div>
      <div style="text-align:center;padding:20px 0;color:var(--gray-400);font-size:12px">尚未安排下一位個案</div>
      <div class="xact" style="justify-content:center"><button class="btn bp btn-xs" onclick="event.stopPropagation();openWaitlistModal('${bedNo}','${caseName}','${dischargeText||''}')">安排床位</button></div></div>`;
  }
  if(!curBlock&&!nextBlock){
    const roomSize=(vlistRowInfo[bedNo]&&vlistRowInfo[bedNo].roomSize)||'';
    const arrangeBtn=bedStatus==='可使用'?`<div style="text-align:center;padding-top:8px"><button class="btn bp btn-xs" onclick="event.stopPropagation();openBedModal('${bedNo}','${roomSize}房')">安排入院</button></div>`:'';
    return `<div style="text-align:center;padding:10px;color:var(--gray-400);font-size:12px">此床位目前無入住個案或候補資料</div>${arrangeBtn}`;
  }
  return `<div class="bedvw-cols">${curBlock}${nextBlock}</div>`;
}
// 候補中操作欄按鈕原本綁定在按鈕本身，這裡改由床號反查該候補列的按鈕，供 vlist 展開列的「取消預排」「調整預排」呼叫
function cancelWaitlistFromVList(bedNo){
  const row=[...document.querySelectorAll('#waiting-body tr[data-bed]')].find(r=>r.dataset.bed===bedNo);
  const btn=row?row.querySelector('button'):null;
  if(btn) cancelWaitlist(btn);
}
function adjustWaitlistFromVList(bedNo){
  const row=[...document.querySelectorAll('#waiting-body tr[data-bed]')].find(r=>r.dataset.bed===bedNo);
  if(!row) return;
  const occupantName=row.children[3]?row.children[3].textContent:'';
  const movein=row.dataset.movein;
  markBedWaiting(bedNo,false);
  removeWaitlistRow(row);
  restorePendingRow(bedNo);
  openWaitlistModal(bedNo,occupantName,movein);
}

function toggleVRow(bedNo,mainRow){
  let xrow=mainRow.nextElementSibling;
  const btn=mainRow.querySelector('.xb');
  const isHidden=xrow.classList.contains('hidden');
  if(isHidden){
    xrow.querySelector('td').innerHTML=buildBedExpandContent(vlistRowInfo[bedNo]);
  }
  xrow.classList.toggle('hidden',!isHidden);
  if(btn) btn.textContent=isHidden?'▼':'▶';
}

// 整體重構：把 vlist 每一列改成可展開列，並插入「病房類型」「預計可用」欄位；展延欄依五狀態邏輯改寫
let vlistRowInfo={};
// 姓名＋年齡＋性別合併為一個欄位，格式「姓名(年齡) 性別」，例如「李文雄(75) 男」
function nameAgeGenderCell(nameHtml,ageGenderText){
  const m=ageGenderText.match(/(\d+)\s*歲\s*([男女])/);
  if(!m) return nameHtml;
  const suffix='('+m[1]+') '+m[2];
  return nameHtml.includes('</strong>') ? nameHtml.replace('</strong>','</strong>'+suffix) : nameHtml+suffix;
}
// 病室房型（幾人房）對照表：掃描病室總覽的病室卡片建立床號→房型對照，供個案排床總覽的「床位」欄使用
let ROOM_SIZE_MAP=null;
function buildRoomSizeMap(){
  ROOM_SIZE_MAP={};
  document.querySelectorAll('#vgrid .room-blk').forEach(blk=>{
    const roomNoEl=blk.querySelector('.room-no');
    if(!roomNoEl) return;
    const roomNo=(roomNoEl.textContent.match(/^\d+/)||[])[0];
    const sizeSpan=roomNoEl.querySelector('span');
    const size=sizeSpan?sizeSpan.textContent.replace('房',''):'—';
    if(roomNo) ROOM_SIZE_MAP[roomNo]=size;
  });
}

// 個案排床總覽（住院中／展延）：欄位內容與床位總覽列表完全一致，只是群組順序改為「目前入住→下一位入院→床位」（個案優先視角）
// mode='admitted'：原始欄位含 病歷號/入院日/展延（住院中／展延／今日出院）
// mode='planned' ：原始欄位含 房型偏好/預計入院/個管師，尚未實際入住，無病歷號可考（今日入院／待排床／已預約）
function initCaseTableExpand(tbodyId,mode){
  mode=mode||'admitted';
  const tbody=document.getElementById(tbodyId);
  if(!tbody||tbody.dataset.expandInit) return;
  tbody.dataset.expandInit='1';
  if(!ROOM_SIZE_MAP) buildRoomSizeMap();

  const table=tbody.closest('table');
  const oldThead=table.querySelector('thead');
  const newThead=document.createElement('thead');
  const opTh=mode==='today-in'||mode==='today-out'?'<th>操作</th>':'';
  newThead.innerHTML=`
    <tr><th style="width:24px"></th><th colspan="6" class="bedvw-grp">目前入住</th><th colspan="3" class="bedvw-grp">床位</th><th colspan="2" class="bedvw-grp">下一位入院</th>${opTh?'<th></th>':''}</tr>
    <tr><th style="width:24px"></th><th>姓名</th><th>疾病別</th><th>展延</th><th>入院日</th><th>預計出院</th><th>預計可用</th><th>床號</th><th>房型</th><th>病房類型</th><th>姓名</th><th>預計入院</th>${opTh}</tr>`;
  oldThead.replaceWith(newThead);

  [...tbody.children].forEach(tr=>{
    const tds=[...tr.children];
    if(tds.length<11){ tr.querySelectorAll('td').forEach(td=>td.colSpan=12); return; } // 提示列（例如「目前沒有其他已預約個案」）僅調整跨欄寬度，不套用展開邏輯
    const nameHtml=tds[1].innerHTML;
    const ageGenderText=tds[2].textContent.trim();
    const typeBadge=tds[3].innerHTML;
    const isPac=typeBadge.includes('tt-pac');
    const isPlannedLike=(mode==='planned'||mode==='today-in');
    const isAdmittedLike=(mode==='admitted'||mode==='today-out');
    const bedStatus=isPlannedLike?'已預約':(isPac?'PAC住院中':(typeBadge.includes('tt-hos')?'安寧住院':'一般住院'));
    const diseaseHtml=tds[4].innerHTML;
    const bedNoRaw=tds[5].textContent.trim();
    const hasBed=bedNoRaw&&bedNoRaw!=='—'&&bedNoRaw!=='尚未安排';
    const bedNo=hasBed?bedNoRaw:null;
    const rawName=nameHtml.replace(/<[^>]+>/g,'').trim().split(/\s/)[0];
    const roomNo=bedNo?bedNo.split('-')[0]:null;

    let mrnText,admitText,dischargeHtml,dischargeText,extHtml;
    if(isAdmittedLike){
      mrnText=tds[6].textContent.trim();
      admitText=tds[7].textContent.trim();
      dischargeHtml=tds[8].innerHTML;
      dischargeText=tds[8].textContent.trim();
      extHtml=tds[9].innerHTML;
    }else{
      // planned／today-in：無病歷號（尚未入住，通常也查不到），入院日欄用「預計入院」代替，展延不適用
      mrnText='—';
      admitText=tds[7].textContent.trim(); // 預計入院
      dischargeHtml=tds[8].innerHTML; // 預計出院
      dischargeText=tds[8].textContent.trim();
      extHtml='<span style="color:var(--gray-300)">—</span>';
    }

    if(bedNo){
      vlistRowInfo[bedNo]=vlistRowInfo[bedNo]||{bedNo,roomNo,roomSize:ROOM_SIZE_MAP[roomNo]||'—',bedStatus,caseName:rawName,diseaseText:tds[4].textContent.trim(),mrnText,dischargeText};
    }
    const waitTr=bedNo?[...document.querySelectorAll('#waiting-body tr[data-bed]')].find(r=>r.dataset.bed===bedNo):null;
    const nextName=waitTr?waitTr.dataset.candidate:'—';
    const nextMovein=waitTr?waitTr.dataset.movein:'—';
    const bedCell=bedNo?`<strong>${bedNo}</strong>`:'<span style="color:var(--gray-300)">尚未安排</span>';
    const roomSizeCell=roomNo?(ROOM_SIZE_MAP[roomNo]||'—'):'—';
    const roomTypeCellHtml=roomNo?roomTypeCell(roomNo):'<span style="color:var(--gray-300)">—</span>';
    // 待排床（無床位）：從原本「操作」欄的安排床位按鈕取出個案 ID，展開列改用真正可點擊的按鈕呈現，而非純文字提示
    const opCaseIdMatch=tds[10]?tds[10].innerHTML.match(/openCaseModal\('([^']+)'\)/):null;
    const opCaseId=opCaseIdMatch?opCaseIdMatch[1]:null;
    const toggleAction=bedNo?`toggleVRow('${bedNo}',this.closest('tr'))`:`toggleXFallback(this.closest('tr'),'${opCaseId||''}')`;

    const opBtn=mode==='today-in'
      ? `<td><button class="btn bp btn-xs" onclick="event.stopPropagation();admitByBedNo('${bedNo}')">確定入院</button></td>`
      : mode==='today-out'
        ? `<td><button class="btn bd btn-xs" onclick="event.stopPropagation();openDischargeConfirm(null,'${bedNo}','${rawName}')">確定出院</button></td>`
        : '';

    tr.innerHTML=`
      <td><button class="xb" style="padding:2px 7px" onclick="event.stopPropagation();${toggleAction}">▶</button></td>
      <td>${nameAgeGenderCell(nameHtml,ageGenderText)}</td>
      <td>${diseaseHtml}</td>
      <td>${extHtml}</td>
      <td>${admitText||'—'}</td>
      <td>${dischargeHtml}</td>
      <td>${bedNo?computeAvailDate(bedStatus,dischargeText):'—'}</td>
      <td>${bedCell}</td>
      <td>${roomSizeCell}</td>
      <td>${roomTypeCellHtml}</td>
      <td>${nextName}</td>
      <td>${nextMovein}</td>
      ${opBtn}`;
    tr.onclick=bedNo?function(){toggleVRow(bedNo,tr);}:function(){toggleXFallback(tr,opCaseId||'');};

    const xtr=document.createElement('tr');
    xtr.className='xrow hidden';
    const td=document.createElement('td');
    td.colSpan=tr.children.length;
    xtr.appendChild(td);
    tr.after(xtr);
  });
}
// 待排床等尚未有床位的個案：無 bedNo 可查 vlistRowInfo，改直接顯示「尚未安排床位」提示
function toggleXFallback(mainRow,caseId){
  const xrow=mainRow.nextElementSibling;
  const btn=mainRow.querySelector('.xb');
  const isHidden=xrow.classList.contains('hidden');
  if(isHidden){
    const arrangeBtn=caseId?`<div style="text-align:center;padding-top:8px"><button class="btn bp btn-xs" onclick="event.stopPropagation();openCaseModal('${caseId}')">安排床位</button></div>`:'';
    xrow.querySelector('td').innerHTML=`<div style="text-align:center;padding:10px;color:var(--gray-400);font-size:12px">尚未安排床位</div>${arrangeBtn}`;
  }
  xrow.classList.toggle('hidden',!isHidden);
  if(btn) btn.textContent=isHidden?'▼':'▶';
}
function initVListExpand(){
  const table=document.querySelector('#vlist table.blt');
  const tbody=table?table.querySelector('tbody'):null;
  if(!table||!tbody||tbody.dataset.expandInit) return;
  tbody.dataset.expandInit='1';

  // 表頭改為三組群組表頭（床位／目前入住／下一位入院），完全比照 PDF 紅框折疊列表的 9 個欄位＋候補姓名／預計入院
  const oldThead=table.querySelector('thead');
  const newThead=document.createElement('thead');
  newThead.innerHTML=`
    <tr><th style="width:24px"></th><th colspan="3" class="bedvw-grp">床位</th><th colspan="6" class="bedvw-grp">目前入住</th><th colspan="2" class="bedvw-grp">下一位入院</th></tr>
    <tr><th style="width:24px"></th><th>床號</th><th>房型</th><th>病房類型</th><th>姓名</th><th>疾病別</th><th>展延</th><th>入院日</th><th>預計出院</th><th>預計可用</th><th>姓名</th><th>預計入院</th></tr>`;
  oldThead.replaceWith(newThead);

  [...tbody.children].forEach(tr=>{
    const tds=[...tr.children];
    // 原始 12 欄資料源（床號/病室/房型/樓層/類型/姓名/疾病別/病歷號/入院日/預計出院/展延/操作），僅取值不保留在畫面上
    const bedNo=tds[0].textContent.trim();
    const roomNo=tds[1].textContent.trim();
    const roomSize=tds[2].textContent.trim();
    const bedStatus=tr.dataset.bedStatus||'';
    const rawName=tds[5].textContent.trim();
    const nameMatch=rawName.match(/^([^\s(（]+)/);
    const caseName=nameMatch?nameMatch[1]:rawName;
    const diseaseHtml=tds[6].innerHTML;
    const mrnText=tds[7].textContent.trim();
    const admitText=tds[8].textContent.trim();
    const dischargeHtml=tds[9].innerHTML;
    const dischargeText=tds[9].textContent.trim();

    vlistRowInfo[bedNo]=vlistRowInfo[bedNo]||{bedNo,roomNo,roomSize,bedStatus,caseName,diseaseText:tds[6].textContent.trim(),mrnText,dischargeText};

    const waitTr=[...document.querySelectorAll('#waiting-body tr[data-bed]')].find(r=>r.dataset.bed===bedNo);
    const nextName=waitTr?waitTr.dataset.candidate:'—';
    const nextMovein=waitTr?waitTr.dataset.movein:'—';

    const nameCell=bedStatus==='可使用'
      ? `<button class="btn bp btn-xs" onclick="event.stopPropagation();openBedModal('${bedNo}','${roomSize}房')">安排入院</button>`
      : rawName;
    tr.innerHTML=`
      <td><button class="xb" style="padding:2px 7px" onclick="event.stopPropagation();toggleVRow('${bedNo}',this.closest('tr'))">▶</button></td>
      <td><strong>${bedNo}</strong></td>
      <td>${roomSize}</td>
      <td>${roomTypeCell(roomNo)}</td>
      <td>${nameCell}</td>
      <td>${diseaseHtml}</td>
      <td>${vlistExtCell(bedNo,bedStatus==='PAC住院中')}</td>
      <td>${admitText||'—'}</td>
      <td>${dischargeHtml}</td>
      <td class="avail-cell" data-bed="${bedNo}">${computeAvailDate(bedStatus,dischargeText)}</td>
      <td>${nextName}</td>
      <td>${nextMovein}</td>`;
    tr.onclick=function(){toggleVRow(bedNo,tr);};

    const xtr=document.createElement('tr');
    xtr.className='xrow hidden';
    const td=document.createElement('td');
    td.colSpan=tr.children.length;
    xtr.appendChild(td);
    tr.after(xtr);
  });
}
initCaseTableExpand('today-in-body','today-in');
initCaseTableExpand('today-out-body','today-out');
initCaseTableExpand('pending-body','planned');
initCaseTableExpand('reserved-body','planned');
initCaseTableExpand('hosp-body','admitted');
initCaseTableExpand('extend-body','admitted');
initVListExpand();
initDischargedExpand();
applyRoomGenderTags();

// ══ 已出院列表：沿用「目前入住／床位」欄位格式，但不含「下一位入院」（人已出院，沒有候補接手的意義）══
function initDischargedExpand(){
  const tbody=document.getElementById('discharged-body');
  if(!tbody||tbody.dataset.expandInit) return;
  tbody.dataset.expandInit='1';
  if(!ROOM_SIZE_MAP) buildRoomSizeMap();

  const table=tbody.closest('table');
  const oldThead=table.querySelector('thead');
  const newThead=document.createElement('thead');
  newThead.innerHTML=`
    <tr><th style="width:24px"></th><th colspan="6" class="bedvw-grp">出院個案</th><th colspan="3" class="bedvw-grp">床位</th></tr>
    <tr><th style="width:24px"></th><th>姓名</th><th>疾病別</th><th>展延</th><th>入院日</th><th>出院日</th><th>轉介來源</th><th>床號</th><th>房型</th><th>病房類型</th></tr>`;
  oldThead.replaceWith(newThead);

  [...tbody.children].forEach(tr=>renderDischargedRow(tr));
}
// 單一列的欄位重排＋展開列建立，供初始化與「動態新增已出院列」（moveCaseToDischarged）共用
function renderDischargedRow(tr){
  if(!ROOM_SIZE_MAP) buildRoomSizeMap();
  const tds=[...tr.children];
  if(tds.length<10) return;
  const nameHtml=tds[1].innerHTML;
  const ageGenderText=tds[2].textContent.trim();
  const typeBadge=tds[3].innerHTML;
  const diseaseHtml=tds[4].innerHTML;
  const bedNo=tds[5].textContent.trim();
  const mrnText=tds[6].textContent.trim();
  const admitText=tds[7].textContent.trim();
  const dischargeText=tds[8].textContent.trim();
  const note=tds[9].textContent.trim();
  const rawName=nameHtml.replace(/<[^>]+>/g,'').trim();
  const roomNo=bedNo&&bedNo!=='—'?bedNo.split('-')[0]:null;
  const referral=tr.dataset.referral||'—';
  const caseType=typeBadge.includes('tt-pac')?'PAC':(typeBadge.includes('tt-hos')?'安寧':(typeBadge.includes('tt-gen')?'一般':''));
  tr.dataset.caseType=caseType;

  const xid='xd'+Math.random().toString(36).slice(2,9);
  tr.innerHTML=`
    <td><button class="xb" style="padding:2px 7px" onclick="event.stopPropagation();toggleDischargedRow('${xid}',this)">▶</button></td>
    <td>${nameAgeGenderCell(nameHtml,ageGenderText)}</td>
    <td>${typeBadge} ${diseaseHtml}</td>
    <td><span style="color:var(--gray-300)">—</span></td>
    <td>${admitText||'—'}</td>
    <td>${dischargeText||'—'}</td>
    <td>${referral}</td>
    <td>${bedNo&&bedNo!=='—'?'<strong>'+bedNo+'</strong>':'—'}</td>
    <td>${roomNo?(ROOM_SIZE_MAP[roomNo]||'—'):'—'}</td>
    <td>${roomNo?roomTypeCell(roomNo):'<span style="color:var(--gray-300)">—</span>'}</td>`;
  tr.onclick=function(){toggleDischargedRow(xid,tr.querySelector('.xb'));};

  const xtr=document.createElement('tr');
  xtr.id=xid;
  xtr.className='xrow hidden';
  xtr.innerHTML=`<td colspan="${tr.children.length}">
    <div class="bedvw-panel"><div class="bedvw-cols"><div class="bedvw-col">
      <div class="bedvw-title">出院個案：${rawName}</div>
      ${fRow([['病歷號',mrnText],['發病日',tr.dataset.onset],['來源',referral],['主治醫師',tr.dataset.doctor],['科別',tr.dataset.dept]])}
      ${fRow([['家屬',tr.dataset.family],['關係',tr.dataset.relation],['聯絡電話',tr.dataset.phone],['房型偏好',tr.dataset.roompref]])}
      <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">備註</div>
      <div style="font-size:12px;color:var(--gray-600);padding:7px 9px;background:var(--white);border:1px solid var(--gray-200);border-radius:6px;min-height:20px">${note||'—'}</div>
      <div class="xact" style="margin-top:10px"><button class="btn bg btn-xs" onclick="event.stopPropagation();alert('前往個案管理模組：${rawName}')">前往個案管理模組</button></div>
    </div></div></div>
  </td>`;
  tr.after(xtr);
}
// 已出院展開列使用亂數 id，button 直接持有 this 參照，不依賴全域 toggleX 的 id 命名慣例
function toggleDischargedRow(id,btn){
  const row=document.getElementById(id);
  if(!row) return;
  const h=row.classList.contains('hidden');
  row.classList.toggle('hidden',!h);
  if(btn) btn.textContent=h?'▼':'▶';
}
// 已出院分頁篩選：姓名／床號關鍵字 + 上游醫院 + 疾病別 + 住院類型 + 出院日期區間
function filterDischargedList(){
  const kw=(document.getElementById('dis-search')?.value||'').trim();
  const referralVal=document.getElementById('dis-referral')?.value||'';
  const diseaseVal=document.getElementById('dis-disease')?.value||'';
  const typeVal=document.getElementById('dis-type')?.value||'';
  const fromVal=document.getElementById('dis-date-from')?.value;
  const toVal=document.getElementById('dis-date-to')?.value;
  const fromDate=fromVal?new Date(fromVal):null;
  const toDate=toVal?new Date(toVal):null;
  const body=document.getElementById('discharged-body');
  if(!body) return;
  [...body.children].forEach(row=>{
    const tds=row.children;
    if(!tds||tds.length<9){ row.classList.remove('hidden'); return; }
    const name=tds[1].textContent;
    const bed=tds[7].textContent;
    const disease=tds[2].textContent;
    const referral=row.dataset.referral||'';
    const typeBadgeText=row.dataset.caseType||'';
    let show=true;
    if(kw&&!name.includes(kw)&&!bed.includes(kw)) show=false;
    if(show&&referralVal&&referral!==referralVal) show=false;
    if(show&&diseaseVal&&!disease.includes(diseaseVal)) show=false;
    if(show&&typeVal&&typeBadgeText!==typeVal) show=false;
    if(show&&(fromDate||toDate)){
      const d=parseListDate(tds[5].textContent);
      if(!d) show=false;
      else{
        if(fromDate&&d<fromDate) show=false;
        if(toDate&&d>toDate) show=false;
      }
    }
    row.classList.toggle('hidden',!show);
  });
}

// ══ 待輸入病歷號個案：輸入病歷號後模擬串接杏翔，帶出主治醫師／科別，完成後從清單移除 ══
let mrnTargetRow=null;
function openMrnModal(btn){
  mrnTargetRow=btn.closest('tr');
  const name=mrnTargetRow.dataset.caseName||'';
  document.getElementById('mrn-target-name').textContent='個案：'+name;
  document.getElementById('mrn-input').value='';
  document.getElementById('mrn-result').classList.add('hidden');
  openModal('m-mrn');
}
function submitMrn(){
  const val=document.getElementById('mrn-input').value.trim();
  if(!val){ alert('請輸入病歷號'); return; }
  // Prototype：模擬串接杏翔成功，帶出假資料
  document.getElementById('mrn-doctor').value='王主任（神經內科）';
  document.getElementById('mrn-dept').value='神經內科';
  document.getElementById('mrn-result').classList.remove('hidden');
  setTimeout(()=>{
    closeModal('m-mrn');
    if(mrnTargetRow){
      alert('已完成串接杏翔：病歷號 '+val+'，主治醫師／科別已補上');
      mrnTargetRow.remove();
      const badgeCount=document.querySelectorAll('#need-mrn-body tr').length;
      const ph=document.querySelector('#tc-need-mrn .ps');
      if(ph) ph.textContent='個案已透過「新增個案」手動建立或從個案管理模組匯入，但尚未輸入病歷號，無法串接杏翔帶出主治醫師／科別（尚有 '+badgeCount+' 筆）';
    }
    mrnTargetRow=null;
  },500);
}

// ══ 今日更新：個管師勾選「已完成登記」表示已手動同步到杏翔，勾選後該列淡化處理 ══
function toggleTodayUpdateDone(cb){
  const row=cb.closest('tr');
  row.style.opacity=cb.checked?'0.45':'1';
  row.style.textDecoration=cb.checked?'line-through':'none';
}
