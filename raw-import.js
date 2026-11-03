(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = v => typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g,"").trim());
  function date(v) {
    if (typeof v === "number") {
      if (v >= 19000101 && v <= 29991231) { const s=String(v); return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8); }
      const p=XLSX.SSF.parse_date_code(v); if(p) return p.y+"-"+String(p.m).padStart(2,"0")+"-"+String(p.d).padStart(2,"0");
    }
    const s=String(v??"").trim();
    if (/^\d{8}$/.test(s)) return s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const d=new Date(s); return isNaN(d)?null:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function message(t,ok) {
    const e=$("raw-import-message"); e.textContent=t;
    e.className="mt-5 rounded-xl border p-4 text-sm "+(ok?"border-emerald-800 bg-emerald-950/20 text-emerald-200":"border-rose-800 bg-rose-950/30 text-rose-200");
    e.classList.remove("hidden");
  }
  window.renderRawImport = function() {
    $("raw-import-panel").innerHTML =
      '<div class="grid lg:grid-cols-2 gap-5">'+
      '<div class="rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><h4 class="font-semibold">Upload RAW Sellout</h4>'+
      '<p class="text-xs text-slate-400 mt-2">Excel .xlsx/.xls, maksimal 20 MB. Pilih file lalu jalankan validasi.</p>'+
      '<input id="raw-file-input" type="file" accept=".xlsx,.xls" class="field block w-full rounded-xl p-3 mt-4 text-sm">'+
      '<button id="raw-analyze-btn" class="mt-3 w-full rounded-xl bg-cyan-400 text-slate-950 font-bold py-3">Validasi & Preview</button></div>'+
      '<div class="rounded-2xl border border-slate-700 bg-slate-950/40 p-5"><h4 class="font-semibold">Aturan pencocokan</h4>'+
      '<ul class="text-xs text-slate-400 mt-3 space-y-2"><li>Promoter ID cocok EC aktif: ditautkan ke EC.</li><li>ID awalan SP: Store Shadow, tanpa akun login.</li><li>ID belum cocok: tetap disimpan sebagai Unmapped.</li><li>IMEI/SN adalah kunci unik untuk mencegah transaksi ganda.</li><li>EULA VALID masuk achievement; PENDING terpisah.</li></ul></div></div>'+
      '<div id="raw-import-message" class="hidden mt-5 rounded-xl border p-4 text-sm"></div><div id="raw-import-preview" class="mt-5"></div>';
    $("raw-analyze-btn").addEventListener("click", analyze);
  };
  async function analyze() {
    const f=$("raw-file-input").files[0]; $("raw-import-preview").innerHTML="";
    if(!f) return message("Pilih file Excel terlebih dahulu.",false);
    if(f.size>20*1024*1024) return message("Ukuran file melebihi 20 MB.",false);
    const b=$("raw-analyze-btn"); b.disabled=true; b.textContent="Memeriksa…";
    try {
      const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true});
      const sheet=wb.SheetNames.find(n=>XLSX.utils.sheet_to_json(wb.Sheets[n]).length);
      if(!sheet) throw Error("Sheet Excel kosong.");
      const source=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:"",raw:true});
      const key=s=>String(s??"").trim().toLowerCase().replace(/\s+/g," ");
      const hm={}; Object.keys(source[0]||{}).forEach(k=>hm[key(k)]=k);
      const required=["site id","imei/sn","marketing name","eula status","rrp price (local)","sellout_qty","day"];
      const missing=required.filter(k=>!hm[k]); if(missing.length) throw Error("Kolom wajib tidak ditemukan: "+missing.join(", "));
      const [stores,people]=await Promise.all([
        fetchAll("stores","site_id,site_name"),
        fetchAll("manpower","promoter_id,fieldforce_position,is_active",q=>q.eq("is_active",true))
      ]);
      const storeMap=new Map(stores.map(s=>[String(s.site_id).trim(),s]));
      const ec=new Set(people.filter(p=>String(p.fieldforce_position||"").toUpperCase()==="EC"&&p.promoter_id).map(p=>String(p.promoter_id).trim()));
      const idCounts=new Map(); source.forEach(r=>{const id=String(r[hm["imei/sn"]]??"").trim();if(id)idCounts.set(id,(idCounts.get(id)||0)+1);});
      const valid=[], invalid=[];
      source.forEach((r,i)=>{
        const get=k=>r[hm[k]]??"", id=String(get("imei/sn")).trim(), site=String(get("site id")).trim();
        const promoter=String(get("promoter id")).trim(), sold=date(get("day")), model=String(get("marketing name")).trim();
        const status=String(get("eula status")).trim().toUpperCase(), price=num(get("rrp price (local)")), qty=num(get("sellout_qty"));
        const errors=[];
        if(!id) errors.push("IMEI/SN kosong"); else if(idCounts.get(id)>1) errors.push("IMEI/SN duplikat dalam file");
        if(!storeMap.has(site)) errors.push("Site ID tidak ada di master toko");
        if(!model) errors.push("Marketing Name kosong");
        if(!sold) errors.push("Tanggal tidak valid");
        if(!["VALID","PENDING"].includes(status)) errors.push("Status EULA tidak valid");
        if(!Number.isFinite(price)||price<0) errors.push("Harga tidak valid");
        if(!Number.isFinite(qty)||qty<=0) errors.push("Qty tidak valid");
        if(errors.length){invalid.push({line:i+2,id,reason:errors.join("; ")});return;}
        const store=storeMap.get(site);
        const category=!promoter?"Tanpa Promoter ID":promoter.toUpperCase().startsWith("SP-")?"Store Shadow":ec.has(promoter)?"EC Aktif":"Unmapped Promoter";
        valid.push({transaction_id:id,site_id:site,site_name:String(get("site name")||store.site_name),promoter_id:promoter||null,promoter_name:String(get("promoter name")||"")||null,model,ram:String(get("hhp memory")||"")||null,storage:String(get("hhp storage")||"")||null,color:String(get("color")||"")||null,price_segment:String(get("price seg")||"")||null,eula_status:status,unit_price:price,qty,amt:price*qty,sold_at:sold,week_code:String(get("week")||"")||null,month_code:String(get("month")||sold.slice(0,7).replace("-",""))||null,tl_name:String(get("spv / tl name")||"")||null,segment:String(get("segment by target")||"")||null,promoter_mapping_status:category==="EC Aktif"?"EC_ACTIVE":category==="Store Shadow"?"STORE_SHADOW":category==="Unmapped Promoter"?"UNMAPPED":"NO_PROMOTER_ID",_category:category});
      });
      window.rawImportPreview={file:f,valid,invalid,sheet};
      renderPreview();
      message("Validasi selesai. Belum ada data yang disimpan.",true);
    } catch(e) { console.error(e); message(e.message||"Gagal membaca file.",false); }
    finally { b.disabled=false; b.textContent="Validasi & Preview"; }
  }
  function renderPreview() {
    const p=window.rawImportPreview, v=p.valid;
    const count=k=>v.filter(r=>r._category===k).length;
    let html='<div class="flex justify-between items-center gap-3"><div><h4 class="font-semibold">Hasil validasi</h4><p class="text-xs text-slate-500 mt-1">'+esc(p.file.name)+'</p></div><button id="raw-commit-btn" class="rounded-xl bg-cyan-400 text-slate-950 font-bold px-5 py-3" '+(!v.length?'disabled':'')+'>Konfirmasi & Impor</button></div>';
    html+='<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">';
    [["Siap diimpor",v.length],["Invalid",p.invalid.length],["EC aktif",count("EC Aktif")],["Store Shadow",count("Store Shadow")],["Unmapped",count("Unmapped Promoter")],["Tanpa ID",count("Tanpa Promoter ID")]].forEach(x=>html+='<div class="rounded-xl border border-slate-700 p-3"><div class="text-xs text-slate-500">'+x[0]+'</div><div class="text-xl font-semibold">'+x[1]+'</div></div>');
    html+='</div><div class="table-wrap rounded-xl border border-slate-800 mt-4"><table class="w-full text-xs"><thead><tr><th>IMEI/SN</th><th>Tanggal</th><th>Toko</th><th>Promoter</th><th>Klasifikasi</th><th>Qty</th><th>Amt</th><th>EULA</th></tr></thead><tbody>';
    v.slice(0,25).forEach(r=>html+='<tr><td>'+esc(r.transaction_id)+'</td><td>'+esc(r.sold_at)+'</td><td>'+esc(r.site_name)+'</td><td>'+esc(r.promoter_id||"-")+'</td><td>'+esc(r._category)+'</td><td>'+r.qty+'</td><td>'+new Intl.NumberFormat("id-ID").format(r.amt)+'</td><td>'+esc(r.eula_status)+'</td></tr>');
    html+='</tbody></table></div>';
    if(p.invalid.length) html+='<p class="text-xs text-rose-300 mt-4">Baris invalid: '+p.invalid.slice(0,10).map(x=>"baris "+x.line+" ("+esc(x.reason)+")").join(" · ")+'</p>';
    $("raw-import-preview").innerHTML=html;
    if(v.length) $("raw-commit-btn").addEventListener("click",commit);
  }
  async function commit() {
    if(!currentProfile||currentProfile.role!=="admin") return message("Hanya Admin yang dapat mengimpor.",false);
    const p=window.rawImportPreview, b=$("raw-commit-btn");
    if(!confirm("Impor "+p.valid.length+" transaksi? Transaksi dengan IMEI/SN yang sudah ada akan diperbarui.")) return;
    b.disabled=true; b.textContent="Menyimpan…";
    let importId=null, inserted=0, updated=0;
    try {
      const ids=p.valid.map(r=>r.transaction_id), existing=new Set();
      for(let i=0;i<ids.length;i+=400){
        const {data,error}=await client.from("raw_sellout").select("transaction_id").in("transaction_id",ids.slice(i,i+400));
        if(error) throw error; (data||[]).forEach(x=>existing.add(x.transaction_id));
      }
      const h=await client.from("import_history").insert({import_type:"raw_sellout",file_name:p.file.name,status:"processing",total_rows:p.valid.length+p.invalid.length,uploaded_by:currentProfile.id,details:{sheet:p.sheet,invalid:p.invalid.length}}).select("id").single();
      if(h.error) throw h.error; importId=h.data.id;
      const payload=p.valid.map(r=>{const x={...r,import_id:importId,updated_at:new Date().toISOString()};delete x._category;return x;});
      for(let i=0;i<payload.length;i+=150){
        const part=payload.slice(i,i+150),{error}=await client.from("raw_sellout").upsert(part,{onConflict:"transaction_id"});
        if(error) throw error;
        part.forEach(r=>{if(existing.has(r.transaction_id))updated++;else inserted++;});
      }
      const details={sheet:p.sheet,invalid_rows:p.invalid.length,inserted_rows:inserted,updated_rows:updated,store_shadow_rows:countRows("Store Shadow"),unmapped_rows:countRows("Unmapped Promoter")};
      const done=await client.from("import_history").update({status:"completed",inserted_rows:inserted,updated_rows:updated,invalid_rows:p.invalid.length,details,completed_at:new Date().toISOString()}).eq("id",importId);
      if(done.error) throw done.error;
      $("raw-import-preview").innerHTML='<div class="rounded-xl border border-emerald-800 bg-emerald-950/20 p-5 text-emerald-200">Import berhasil: '+inserted+' transaksi baru, '+updated+' diperbarui, '+p.invalid.length+' invalid dilewati.<button id="raw-refresh-dashboard" class="block mt-4 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white">Refresh Dashboard</button></div>';
      $("raw-refresh-dashboard").addEventListener("click",async()=>{await loadDashboard();openSection("Dashboard");});
      message("Import berhasil disimpan ke Supabase.",true); window.rawImportPreview=null;
    } catch(e) {
      if(importId) await client.from("import_history").update({status:"failed",details:{error:e.message,inserted_rows:inserted,updated_rows:updated},inserted_rows:inserted,updated_rows:updated,completed_at:new Date().toISOString()}).eq("id",importId);
      message("Import gagal: "+e.message+". Jika batch sebagian sudah masuk, upload ulang file yang sama untuk menyinkronkan berdasarkan IMEI/SN.",false);
      b.disabled=false;b.textContent="Coba ulang";
    }
    function countRows(c){return p.valid.filter(r=>r._category===c).length;}
  }
})();