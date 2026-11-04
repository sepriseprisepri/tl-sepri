(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = v => String(v ?? "").trim().toLowerCase().replace(/\s+/g," ");
  const clean = v => String(v ?? "").trim();
  const requiredSheets = [
    "DATABASE MANPOWER","STORE WITH EC","STORE NON EC",
    "STORE WITH EC + PROMOTOR ID","STORE NON EC + PROMOTOR ID",
    "STORE SHADOW","TARGET STORE"
  ];
  function show(msg,good=false) {
    const el=$("master-import-message");el.textContent=msg;
    el.className="mt-5 rounded-xl border p-4 text-sm "+(good?"border-emerald-800 bg-emerald-950/20 text-emerald-200":"border-rose-800 bg-rose-950/30 text-rose-200");
    el.classList.remove("hidden");
  }
  function sheetRows(wb,name) {
    const actual=wb.SheetNames.find(s=>norm(s)===norm(name));
    if(!actual)return null;
    return XLSX.utils.sheet_to_json(wb.Sheets[actual],{defval:"",raw:true});
  }
  function col(row,name) {
    const k=Object.keys(row||{}).find(x=>norm(x)===norm(name));
    return k===undefined?"":row[k];
  }
  function duplicates(values) {
    const m=new Map();values.map(clean).filter(Boolean).forEach(v=>m.set(v,(m.get(v)||0)+1));
    return [...m].filter(([,n])=>n>1).map(([v,n])=>({value:v,count:n}));
  }
  // Reviewed canonical decisions for cross-category Site ID conflicts.
  const siteCategoryOverrides = [
    {siteId:"C031860693",siteName:"RAMA PONSEL",category:"WITH_EC",promoterId:"076462",promoterName:"WINDA AYU LESTARI"},
    {siteId:"C040361599",siteName:"MITRA LL PONSEL",category:"NON_EC"},
    {siteId:"C037921620",siteName:"FORTUNE CELL",category:"WITH_EC",promoterId:"MT-02560",promoterName:"FIKY"},
    {siteId:"C006360880",siteName:"AHYAR PONSEL",category:"NON_EC"}
  ];
  function applySiteCategoryOverrides(data) {
    const siteOf = row => clean(col(row,"Site ID"));
    const withIds = new Set(siteCategoryOverrides.filter(x=>x.category==="WITH_EC").map(x=>x.siteId));
    const nonIds = new Set(siteCategoryOverrides.filter(x=>x.category==="NON_EC").map(x=>x.siteId));
    data["STORE WITH EC"] = data["STORE WITH EC"].filter(r=>!nonIds.has(siteOf(r)));
    data["STORE NON EC"] = data["STORE NON EC"].filter(r=>!withIds.has(siteOf(r)));
    data["STORE WITH EC + PROMOTOR ID"] = data["STORE WITH EC + PROMOTOR ID"].filter(r=>!nonIds.has(siteOf(r)));
    data["STORE NON EC + PROMOTOR ID"] = data["STORE NON EC + PROMOTOR ID"].filter(r=>!withIds.has(siteOf(r)));
    const ecRows = data["STORE WITH EC + PROMOTOR ID"];
    // MT-02560 is confirmed only for FORTUNE CELL; remove any stray duplicate assignment.
    ecRows.splice(0,ecRows.length,...ecRows.filter(r=>{
      const pid=clean(col(r,"PROMOTOR ID")||col(r,"PROMOTER ID"));
      return pid!=="MT-02560" || siteOf(r)==="C037921620";
    }));
    // Collapse repeated rows for the same store/promoter pair without hiding cross-store assignments.
    const seenPairs=new Set();
    data["STORE WITH EC + PROMOTOR ID"]=ecRows.filter(r=>{
      const key=siteOf(r)+"|"+clean(col(r,"PROMOTOR ID")||col(r,"PROMOTER ID"));
      if(!siteOf(r)||key.endsWith("|"))return true;
      if(seenPairs.has(key))return false;
      seenPairs.add(key);return true;
    });
    const canonicalEcRows=data["STORE WITH EC + PROMOTOR ID"];
    siteCategoryOverrides.filter(x=>x.category==="WITH_EC").forEach(o=>{
      let row = canonicalEcRows.find(r=>siteOf(r)===o.siteId);
      if(!row){ row={"Site ID":o.siteId,"Site Name":o.siteName}; ecRows.push(row); }
      const setField=(aliases,fallback,value)=>{
        const key=Object.keys(row).find(k=>aliases.includes(norm(k)))||fallback;
        row[key]=value;
      };
      setField(["site id"],"Site ID",o.siteId);
      setField(["site name"],"Site Name",o.siteName);
      setField(["promotor id","promoter id"],"Promotor ID",o.promoterId);
      setField(["promotor name","promoter name"],"Promotor Name",o.promoterName);
    });
    return siteCategoryOverrides.map(o=>({siteId:o.siteId,siteName:o.siteName,category:o.category,promoterId:o.promoterId||null,promoterName:o.promoterName||null}));
  }
window.renderImportHub=function(){
    $("import-hub-container").innerHTML=
      '<div class="flex flex-wrap gap-2 mb-5"><button id="tab-raw-import" class="rounded-xl bg-cyan-400 text-slate-950 px-4 py-2 text-sm font-semibold">RAW Sellout</button><button id="tab-master-import" class="rounded-xl border border-slate-700 px-4 py-2 text-sm">Master Database</button></div>'+
      '<div id="raw-import-panel"></div><div id="master-import-panel" class="hidden"></div>';
    const rawBtn=$("tab-raw-import"),masterBtn=$("tab-master-import");
    function activate(which){
      $("raw-import-panel").classList.toggle("hidden",which!=="raw");
      $("master-import-panel").classList.toggle("hidden",which!=="master");
      rawBtn.className=which==="raw"?"rounded-xl bg-cyan-400 text-slate-950 px-4 py-2 text-sm font-semibold":"rounded-xl border border-slate-700 px-4 py-2 text-sm";
      masterBtn.className=which==="master"?"rounded-xl bg-cyan-400 text-slate-950 px-4 py-2 text-sm font-semibold":"rounded-xl border border-slate-700 px-4 py-2 text-sm";
      if(which==="raw")window.renderRawImport();else window.renderMasterImport();
    }
    rawBtn.addEventListener("click",()=>activate("raw"));
    masterBtn.addEventListener("click",()=>activate("master"));
    activate("raw");
  };
  window.renderMasterImport=function(){
    $("master-import-panel").innerHTML=
      '<div class="grid lg:grid-cols-2 gap-5">'+
      '<div class="rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><h4 class="font-semibold">Validasi Master Database</h4>'+
      '<p class="text-xs text-slate-400 mt-2">Upload workbook Database Web dengan 7 sheet master. Tahap ini hanya membaca dan membandingkan data, belum mengubah database.</p>'+
      '<input id="master-file-input" type="file" accept=".xlsx,.xls" class="field block w-full rounded-xl p-3 mt-4 text-sm">'+
      '<button id="master-analyze-btn" class="mt-3 w-full rounded-xl bg-cyan-400 text-slate-950 font-bold py-3">Validasi Master Database</button></div>'+
      '<div class="rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><h4 class="font-semibold">Perlindungan data</h4>'+
      '<ul class="text-xs text-slate-400 mt-3 space-y-2"><li>Tidak membuat atau menghapus akun login.</li><li>Tidak menghapus manpower, toko, atau target yang sudah ada.</li><li>Data yang tidak cocok ditampilkan untuk review.</li><li>Perubahan baru akan disimpan pada tahap commit terpisah setelah hasil preview disetujui.</li></ul></div></div>'+
      '<div id="master-import-message" class="hidden mt-5 rounded-xl border p-4 text-sm"></div>'+
      '<div id="master-import-preview" class="mt-5"></div>';
    $("master-analyze-btn").addEventListener("click",analyze);
  };
  async function analyze(){
    const f=$("master-file-input").files[0],btn=$("master-analyze-btn");
    $("master-import-preview").innerHTML="";
    if(!f)return show("Pilih file Master Database terlebih dahulu.");
    if(f.size>20*1024*1024)return show("Ukuran file melebihi 20 MB.");
    btn.disabled=true;btn.textContent="Memeriksa workbook…";
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
      const missing=requiredSheets.filter(n=>!wb.SheetNames.some(s=>norm(s)===norm(n)));
      if(missing.length)throw Error("Sheet wajib tidak ditemukan: "+missing.join(", "));
      const data={};
      requiredSheets.forEach(n=>data[n]=sheetRows(wb,n)||[]);
      const appliedSiteOverrides=applySiteCategoryOverrides(data);
      const manpower=data["DATABASE MANPOWER"];
      const targets=data["TARGET STORE"];
      const withEc=data["STORE WITH EC"];
      const nonEc=data["STORE NON EC"];
      const shadow=data["STORE SHADOW"];
      const ecProm=data["STORE WITH EC + PROMOTOR ID"];
      const nonEcProm=data["STORE NON EC + PROMOTOR ID"];
      const empDup=duplicates(manpower.map(r=>col(r,"EMPLOYEE ID")));
      const targetDup=duplicates(targets.map(r=>col(r,"SITE ID")));
      const withEcSites=new Set(withEc.map(r=>clean(col(r,"Site ID"))).filter(Boolean));
      const nonEcSites=new Set(nonEc.map(r=>clean(col(r,"Site ID"))).filter(Boolean));
      const siteCategoryConflicts=[...withEcSites].filter(x=>nonEcSites.has(x));
      const siteDup=[];
      const promoterDup=duplicates(ecProm.map(r=>col(r,"PROMOTOR ID")||col(r,"PROMOTER ID")));
      const requiredIssues=[];
      manpower.forEach((r,i)=>{
        const emp=clean(col(r,"EMPLOYEE ID")),name=clean(col(r,"NAME")),pos=clean(col(r,"POSITION"));
        if(!emp||!name||!pos)requiredIssues.push({sheet:"DATABASE MANPOWER",row:i+2,reason:"Employee ID, Name, atau Position kosong"});
      });
      targets.forEach((r,i)=>{
        const site=clean(col(r,"SITE ID")),qty=Number(col(r,"TARGET QTY")),amt=Number(String(col(r,"TARGET AMT")).replace(/,/g,""));
        if(!site||!Number.isFinite(qty)||qty<0||!Number.isFinite(amt)||amt<0)requiredIssues.push({sheet:"TARGET STORE",row:i+2,reason:"Site ID atau target tidak valid"});
      });
      const [stores,people,storeTargets]=await Promise.all([
        fetchAll("stores","site_id,site_name"),
        fetchAll("manpower","employee_id,full_name,fieldforce_position,promoter_id,is_active"),
        fetchAll("store_targets","store_id,period_id,target_qty,target_amt")
      ]);
      const dbSite=new Set(stores.map(x=>clean(x.site_id)));
      const empKey=v=>{const x=clean(v);return /^\d+$/.test(x)?x.padStart(6,"0"):x;};
      const dbEmp=new Map(people.map(x=>[empKey(x.employee_id),x]));
      const unknownTarget=targets.map(r=>clean(col(r,"SITE ID"))).filter(x=>x&&!dbSite.has(x));
      const promoterStyleIds=manpower.map(r=>clean(col(r,"EMPLOYEE ID"))).filter(x=>/^MT-/i.test(x));
      const unknownEmp=manpower.map(r=>clean(col(r,"EMPLOYEE ID"))).filter(x=>x&&!/^MT-/i.test(x)&&!/^SP-/i.test(x)&&!dbEmp.has(empKey(x)));
      const targetSum=targets.reduce((a,r)=>a+(Number(String(col(r,"TARGET AMT")).replace(/,/g,""))||0),0);
      const qtySum=targets.reduce((a,r)=>a+(Number(col(r,"TARGET QTY"))||0),0);
      window.masterImportPreview={file:f.name,sheetNames:wb.SheetNames,data,appliedSiteOverrides,counts:{
        manpower:manpower.length,withEc:withEc.length,nonEc:nonEc.length,ecProm:ecProm.length,nonEcProm:nonEcProm.length,shadow:shadow.length,targets:targets.length
      },duplicates:{employee:empDup,targetSite:targetDup,storeSite:siteDup,promoter:promoterDup},siteCategoryConflicts,promoterStyleIds,requiredIssues,unknownTarget,unknownEmp,targetSum,qtySum,dbCounts:{stores:stores.length,manpower:people.length,storeTargets:storeTargets.length},periods:await fetchAll("target_periods","id,period_name,period_start,period_end")};
      renderPreview();
      show("Validasi workbook selesai. Belum ada data yang diubah di Supabase.",true);
    }catch(e){console.error(e);show(e.message||"Gagal membaca workbook.");}
    finally{btn.disabled=false;btn.textContent="Validasi Master Database";}
  }
  function numeric(v){
    if(typeof v==="number")return Number.isFinite(v)?v:0;
    const x=Number(String(v??"").replace(/,/g,"").trim());
    return Number.isFinite(x)?x:0;
  }
  function buildCommitPayload(p){
    const data=p.data;
    const today=new Date().toISOString().slice(0,10);
    const current=(p.periods||[]).find(x=>x.period_start<=today&&x.period_end>=today);
    const period=current||(p.periods||[]).sort((a,b)=>String(b.period_start).localeCompare(String(a.period_start)))[0];
    if(!period)throw new Error("Periode target belum tersedia di database.");
    const promoterByEmployee=new Map();
    (data["STORE WITH EC + PROMOTOR ID"]||[]).forEach(r=>{
      const emp=clean(col(r,"EMPLOYEE ID"));
      const pid=clean(col(r,"PROMOTOR ID")||col(r,"PROMOTER ID"));
      if(emp&&pid)promoterByEmployee.set(emp,pid);
    });
    const manpower=(data["DATABASE MANPOWER"]||[]).map(r=>{
      const employee_id=clean(col(r,"EMPLOYEE ID"));
      const ff=clean(col(r,"FIELDFORCE_POSITION"));
      const site=clean(col(r,"SITE CODE"));
      return {employee_id,full_name:clean(col(r,"NAME")),position:clean(col(r,"POSITION")),
        fieldforce_position:ff,promoter_id:promoterByEmployee.get(employee_id)||null,
        site_id:site&&site!=="-"?site:null,
        tl_name:clean(col(r,"SPV/SA/TL NAME"))||null,
        tso_name:clean(col(r,"KAO/TSO NAME"))||null};
    }).filter(x=>x.employee_id&&x.full_name);
    const storeMap=new Map();
    const addStore=(r)=>{
      const site=clean(col(r,"SITE ID")),name=clean(col(r,"SITE NAME"));
      if(!site||!name)return;
      const prior=storeMap.get(site)||{};
      storeMap.set(site,{site_id:site,site_name:name,
        channel_category:clean(col(r,"CHANNEL CATEGORY"))||prior.channel_category||null});
    };
    ["TARGET STORE","STORE WITH EC","STORE NON EC","STORE SHADOW","STORE NON EC + PROMOTOR ID"].forEach(k=>(data[k]||[]).forEach(addStore));
    const targets=(data["TARGET STORE"]||[]).map(r=>({site_id:clean(col(r,"SITE ID")),
      target_qty:numeric(col(r,"TARGET QTY")),target_amt:numeric(col(r,"TARGET AMT"))})).filter(x=>x.site_id);
    const ec_assignments=manpower.filter(x=>norm(x.fieldforce_position)==="ec"&&x.site_id)
      .map(x=>({employee_id:x.employee_id,site_id:x.site_id}));
    const coverage=(data["TARGET STORE"]||[]).map(r=>({
      site_id:clean(col(r,"SITE ID")),tl_name:clean(col(r,"SPV NAME")||col(r,"TL NAME"))
    })).filter(x=>x.site_id&&x.tl_name);
    const ecWithoutPromoter=manpower.filter(x=>norm(x.fieldforce_position)==="ec"&&!x.promoter_id);
    if(ecWithoutPromoter.length)throw new Error("Promoter ID belum terpetakan untuk: "+ecWithoutPromoter.map(x=>x.employee_id).join(", "));
    return {file_name:p.file,period_id:period.id,manpower,stores:[...storeMap.values()],targets,ec_assignments,coverage};
  }
  async function commitMasterDatabase(){
    const p=window.masterImportPreview,btn=$("master-commit-btn");
    if(!p||p.committed||!btn)return;
    btn.disabled=true;btn.textContent="Menyimpan Master Database…";
    try{
      const payload=buildCommitPayload(p);
      const {data,error}=await client.rpc("commit_master_database",{p_payload:payload});
      if(error)throw error;
      if(!data||data.success!==true)throw new Error("Supabase tidak mengembalikan status commit berhasil.");
      p.committed=true;
      const result=document.createElement("div");
      result.className="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 text-sm text-emerald-200";
      result.innerHTML="<b>Commit Master Database berhasil.</b><div class='mt-2 text-xs text-emerald-100/80'>Manpower baru: "+esc(data.new_manpower)+" · Toko baru: "+esc(data.new_stores)+" · Target toko: "+esc(data.target_store_rows)+" · Alokasi EC diperbarui: "+esc(data.ec_allocations_upserted)+" · Akun login dibuat: 0</div><div class='mt-1 text-xs text-emerald-100/80'>ID import: "+esc(data.import_id)+"</div>";
      btn.replaceWith(result);show("Master Database berhasil disinkronkan ke Supabase.",true);
    }catch(e){
      console.error(e);btn.disabled=false;btn.textContent="Coba Commit Ulang";
      show(e.message||"Commit Master Database gagal. Proses transaksi dibatalkan sehingga tidak ada perubahan parsial.");
    }
  }
  function renderPreview(){
    const p=window.masterImportPreview,c=p.counts,d=p.duplicates;
    const tiles=[["Manpower",c.manpower],["Store with EC",c.withEc],["Store non EC",c.nonEc],["EC + Promoter ID",c.ecProm],["Non EC + Promoter ID",c.nonEcProm],["Store Shadow",c.shadow],["Target Store",c.targets]];
    let html='<div class="flex flex-wrap items-center justify-between gap-3"><div><h4 class="font-semibold">Ringkasan workbook</h4><p class="text-xs text-slate-500 mt-1">'+esc(p.file)+'</p></div><span class="rounded-full border border-amber-700 px-3 py-1 text-xs text-amber-300">Preview saja · belum disimpan</span></div>';
    html+='<div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mt-4">';
    tiles.forEach(x=>html+='<div class="rounded-xl border border-slate-700 p-3"><div class="text-xs text-slate-500">'+x[0]+'</div><div class="text-xl font-semibold">'+x[1]+'</div></div>');
    html+='</div><div class="rounded-xl border border-cyan-800/70 bg-cyan-950/10 p-4 mt-5"><h5 class="font-semibold text-sm text-cyan-200">Keputusan kategori yang diterapkan</h5><ul class="mt-3 space-y-1 text-xs text-cyan-100/90">'+p.appliedSiteOverrides.map(x=>'<li><b>'+esc(x.siteId)+' · '+esc(x.siteName)+'</b>: '+(x.category==='WITH_EC'?'With EC':'Non EC')+(x.promoterId?' · Promoter '+esc(x.promoterName)+' ('+esc(x.promoterId)+')':'')+'</li>').join("")+'</ul><p class="text-[11px] text-slate-400 mt-2">Aturan diterapkan saat membaca workbook untuk preview; file Excel asli dan data Supabase tidak diubah.</p></div><div class="grid md:grid-cols-2 gap-4 mt-5">';
    html+='<div class="rounded-xl border border-slate-800 p-4"><h5 class="font-semibold text-sm">Pemeriksaan master</h5><p class="text-xs text-slate-400 mt-3">Duplikat Employee ID: <b>'+d.employee.length+'</b></p><p class="text-xs text-slate-400 mt-1">Duplikat Site ID pada Target: <b>'+d.targetSite.length+'</b></p><p class="text-xs text-slate-400 mt-1">Site ID tercantum di kategori With EC dan Non EC: <b>'+p.siteCategoryConflicts.length+'</b></p><p class="text-xs text-slate-400 mt-1">Duplikat Promoter ID EC: <b>'+d.promoter.length+'</b></p><p class="text-xs text-slate-400 mt-1">Baris wajib bermasalah: <b>'+p.requiredIssues.length+'</b></p></div>';
    html+='<div class="rounded-xl border border-slate-800 p-4"><h5 class="font-semibold text-sm">Perbandingan database</h5><p class="text-xs text-slate-400 mt-3">Site ID target belum ada di master toko: <b>'+p.unknownTarget.length+'</b></p><p class="text-xs text-slate-400 mt-1">Employee ID workbook belum ada di master manpower: <b>'+p.unknownEmp.length+'</b></p><p class="text-xs text-slate-400 mt-1">Toko database: <b>'+p.dbCounts.stores+'</b></p><p class="text-xs text-slate-400 mt-1">Manpower database: <b>'+p.dbCounts.manpower+'</b></p><p class="text-xs text-slate-400 mt-1">Baris target tersimpan: <b>'+p.dbCounts.storeTargets+'</b></p><p class="text-xs text-slate-400 mt-1">Total target workbook: <b>'+new Intl.NumberFormat("id-ID").format(p.qtySum)+' Qty · '+new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.targetSum)+'</b></p></div></div>';
    const issues=[];
    d.employee.forEach(x=>issues.push("Employee ID "+x.value+" muncul "+x.count+" kali"));
    d.targetSite.forEach(x=>issues.push("Target Site ID "+x.value+" muncul "+x.count+" kali"));
    p.siteCategoryConflicts.forEach(x=>issues.push("Site ID "+x+" masih konflik setelah aturan keputusan diterapkan; periksa struktur sheet sumber"));
    d.promoter.forEach(x=>issues.push("Promoter ID "+x.value+" muncul "+x.count+" kali"));
    p.requiredIssues.slice(0,15).forEach(x=>issues.push(x.sheet+" baris "+x.row+": "+x.reason));
    p.unknownTarget.slice(0,15).forEach(x=>issues.push("Target Site ID belum ada di database toko: "+x));
    p.unknownEmp.slice(0,15).forEach(x=>issues.push("Employee ID belum ada di database manpower: "+x));
    if(issues.length){
      html+='<div class="rounded-xl border border-amber-800/70 bg-amber-950/10 p-4 mt-5"><h5 class="font-semibold text-sm text-amber-200">Temuan yang perlu ditinjau ('+issues.length+')</h5><ul class="list-disc pl-5 mt-3 space-y-1 text-xs text-amber-100/80">'+issues.slice(0,40).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>';
    }else{
      html+='<div class="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4 mt-5 text-sm text-emerald-200">Tidak ditemukan duplikat atau field wajib kosong dalam pemeriksaan awal.</div>';
    }
    const canCommit=issues.length===0&&!p.committed;
    html+='<div class="mt-5 rounded-xl border border-slate-700 p-4"><div class="text-xs text-slate-400">Commit akan menyinkronkan manpower, master toko, target periode, penempatan EC, coverage TL, dan pembagian target EC. Akun login tidak dibuat atau dihapus. Manpower yang sudah nonaktif tetap nonaktif.</div><button id="master-commit-btn" class="mt-4 w-full rounded-xl '+(canCommit?'bg-emerald-400 text-slate-950':'bg-slate-700 text-slate-400')+' font-bold py-3" '+(canCommit?'':'disabled')+'>'+(p.committed?'Master Database sudah di-commit':canCommit?'Commit Master Database ke Supabase':'Commit terkunci sampai seluruh temuan selesai')+'</button><p class="text-[11px] text-slate-500 mt-2">Periode target dipilih otomatis berdasarkan tanggal hari ini. Seluruh perubahan database dijalankan dalam satu transaksi.</p></div>';
    $("master-import-preview").innerHTML=html;
    const commitBtn=$("master-commit-btn");
    if(commitBtn&&canCommit)commitBtn.addEventListener("click",commitMasterDatabase);
  }
})();