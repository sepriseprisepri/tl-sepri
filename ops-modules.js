/* Samsung Kalteng — scoped operational pages.
 * Data is returned by Supabase RLS; all UI filtering is presentation-only.
 * This module never uses service_role keys or performs database writes.
 */
(function () {
  "use strict";
  const SECTIONS = new Set([
    "Coverage & Toko", "Coverage", "Target", "Target Saya", "RAW Sellout",
    "Performa EC", "Store Shadow", "Focus Model", "Laporan", "Laporan Saya"
  ]);
  const formatter = new Intl.NumberFormat("id-ID", {maximumFractionDigits:3});
  const rupiah = new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0});
  const esc = value => String(value ?? "").replace(/[&<>"']/g,ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const num = value => Number(value||0);
  const nfmt = value => formatter.format(num(value));
  const qtyFmt = value => new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(Math.round(num(value)));
  const currency = value => rupiah.format(num(value));
  const share = (actual,target) => target>0 ? (100*actual/target) : 0;
  const percent = (actual,target) => (target>0 ? share(actual,target).toFixed(1)+"%" : "—");
  const sum=(rows,key)=>rows.reduce((a,row)=>a+num(row[key]),0);
  const tag=(label,good)=>'<span class="pill '+(good?"text-emerald-300":"text-amber-200")+'">'+esc(label)+'</span>';
  let renderToken=0;

  function sectionHead(title,subtitle,period) {
    return '<div class="flex flex-wrap justify-between items-center gap-3 mb-5">'+
      '<div><p class="text-cyan-300 text-xs font-semibold uppercase tracking-widest">Samsung Kalteng · '+esc(period?.period_name||"Periode")+'</p>'+
      '<h3 class="text-xl font-semibold mt-2 text-white">'+esc(title)+'</h3>'+
      '<p class="text-sm text-slate-400 mt-2 leading-6">'+esc(subtitle)+'</p></div>'+
      '<span class="pill text-slate-300">Data langsung · RLS</span></div>';
  }
  function infoCard(label,value,detail="") {
    return '<div class="metric rounded-2xl p-4 sm:p-5 min-w-0">'+
      '<p class="text-xs text-slate-400">'+esc(label)+'</p>'+
      '<p class="text-xl sm:text-2xl text-white font-semibold mt-2 break-words">'+esc(value)+'</p>'+
      (detail?'<p class="text-xs text-slate-500 mt-2">'+esc(detail)+'</p>':"")+'</div>';
  }
  function kpiPanel(items) {
    return '<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4 mb-5">'+
      items.map(([label,value,detail])=>infoCard(label,value,detail)).join("")+'</div>';
  }
  function alert(text) {
    return '<p class="rounded-xl border border-amber-800/50 bg-amber-950/25 p-4 text-sm text-amber-200 leading-6 mb-5">'+esc(text)+'</p>';
  }
  async function all(client,table,cols,configure) {
    const result=[];const pageSize=750;
    for(let from=0;;from+=pageSize){
      let query=client.from(table).select(cols);
      if(configure) query=configure(query);
      const {data,error}=await query.range(from,from+pageSize-1);
      if(error) throw new Error("Gagal mengambil "+table+": "+error.message);
      result.push(...(data||[]));
      if(!data||data.length<pageSize) return result;
    }
  }
  function makeTable(mount,{title,subtitle="",headers,rows,cells,filename}) {
    const box=document.createElement("div");box.className="panel rounded-2xl overflow-hidden";
    box.innerHTML='<div class="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-800">'+
      '<div><h4 class="font-semibold text-white">'+esc(title)+'</h4>'+
      (subtitle?'<p class="text-xs text-slate-400 mt-1">'+esc(subtitle)+'</p>':"")+'</div>'+
      '<div class="flex gap-2 flex-wrap"><input data-search class="field px-3 py-2 rounded-lg text-sm min-w-0 w-40 sm:w-56" placeholder="Cari data…" aria-label="Cari baris tabel">'+
      '<button data-export class="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-300 hover:bg-slate-800">Unduh CSV</button></div></div>'+
      '<div class="table-wrap"><table class="w-full text-sm"><thead><tr>'+
      headers.map(h=>'<th scope="col" class="text-left">'+esc(h)+'</th>').join("")+
      '</tr></thead><tbody data-body></tbody></table></div><p data-count class="text-xs text-slate-500 px-5 py-3"></p>';
    mount.append(box);
    const tbody=box.querySelector("[data-body]"),counter=box.querySelector("[data-count]");
    const search=box.querySelector("[data-search]"),exportBtn=box.querySelector("[data-export]");
    let filtered=rows;
    function paint(){
      const term=search.value.toLocaleLowerCase("id-ID").trim();
      filtered=term?rows.filter(row=>cells(row).some(v=>String(v??"").toLocaleLowerCase("id-ID").includes(term))):rows;
      tbody.innerHTML=filtered.slice(0,150).map(row=>
        '<tr>'+cells(row).map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>'
      ).join("")||'<tr><td colspan="'+headers.length+'" class="text-center text-slate-500 py-8">Tidak ada data pada pencarian ini.</td></tr>';
      counter.textContent=formatter.format(filtered.length)+" baris"+(filtered.length>150?" · 150 baris pertama ditampilkan (CSV memuat semua)":"");
    }
    search.addEventListener("input",paint);
    exportBtn.addEventListener("click",()=>{
      const clean=v=>{
        let s=String(v??"");
        // Guard spreadsheets against formula injection in user-imported fields.
        if(/^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s;
        return '"'+s.replace(/"/g,'""')+'"';
      };
      const csv=[headers,...filtered.map(row=>cells(row))].map(cols=>cols.map(clean).join(",")).join("\r\n");
      const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=filename||"samsung-kalteng.csv";
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),500);
    });
    paint();
  }
  function nowPeriod(period) {
    if(!period||!period.period_start||!period.period_end) throw new Error("Periode target belum dipilih.");
    return period;
  }
  function storeNames(stores) {
    return new Map(stores.map(row=>[row.site_id,row.site_name]));
  }
  function mapById(rows) {return new Map(rows.map(row=>[row.id,row]));}
  function totalByStore(sales){
    const map=new Map();
    sales.forEach(s=>{
      const id=s.site_id;const r=map.get(id)||{qty:0,amt:0,pending:0,valid:0};
      if(s.eula_status==="VALID"){r.qty+=num(s.qty);r.amt+=num(s.amt);r.valid++;}
      else if(s.eula_status==="PENDING")r.pending++;
      map.set(id,r);
    });
    return map;
  }
  async function getSales(client,period){
    return all(client,"raw_sellout",
      "transaction_id,site_id,promoter_id,model,qty,amt,sold_at,eula_status,segment,price_segment,promoter_mapping_status",
      q=>q.gte("sold_at",period.period_start).lte("sold_at",period.period_end).order("sold_at",{ascending:false}));
  }
  async function loadStores(client) {
    return all(client,"stores","id,site_id,site_name,channel_category",q=>q.order("site_id"));
  }
  async function getTargets(client,period,personal,profile){
    if(personal){
      return all(client,"ec_target_allocations","period_id,manpower_id,store_id,target_qty,target_amt",
        q=>q.eq("period_id",period.id).eq("manpower_id",profile.manpower_id));
    }
    return all(client,"store_targets","period_id,store_id,target_qty,target_amt",q=>q.eq("period_id",period.id));
  }
  function groupingTargets(stores,targets,sales) {
    const names=mapById(stores),actual=totalByStore(sales);
    return targets.map(t=>{
      const store=names.get(t.store_id);if(!store)return null;
      const a=actual.get(store.site_id)||{qty:0,amt:0,pending:0};
      return {
        site_id:store.site_id,site_name:store.site_name,category:store.channel_category||"—",
        target_qty:num(t.target_qty),target_amt:num(t.target_amt),
        actual_qty:a.qty,actual_amt:a.amt,pending:a.pending,
        ar:share(a.qty,num(t.target_qty))
      };
    }).filter(Boolean).sort((a,b)=>b.ar-a.ar);
  }
  function targetPage(mount,period,stores,targets,sales,personal) {
    const rows=groupingTargets(stores,targets,sales);
    const qty=sum(rows,"target_qty"),amount=sum(rows,"target_amt"),actual=sum(rows,"actual_qty"),actualAmt=sum(rows,"actual_amt");
    const dateParts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    const today=dateParts.year+"-"+dateParts.month+"-"+dateParts.day;
    const elapsed=Math.max(0,(period.period_end<today?period.period_end:today)>=period.period_start?
      Math.round((Date.parse((period.period_end<today?period.period_end:today)+"T00:00:00Z")-Date.parse(period.period_start+"T00:00:00Z"))/86400000)+1:0);
    const totalDays=Math.round((Date.parse(period.period_end+"T00:00:00Z")-Date.parse(period.period_start+"T00:00:00Z"))/86400000)+1;
    const remaining=today>period.period_end?0:Math.max(0,totalDays-elapsed+(today>=period.period_start?1:0));
    const dailyQty=remaining>0?Math.max(0,qty-actual)/remaining:0;
    const dailyAmt=remaining>0?Math.max(0,amount-actualAmt)/remaining:0;
    mount.innerHTML=sectionHead(personal?"Target Saya":"Target Penjualan",
      personal?"Alokasi personal EC dan pace pencapaian berdasarkan hari MTD.":"Target per toko sesuai cakupan akun.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Target Qty",qtyFmt(qty),"Qty dibulatkan pada tampilan"],
      ["VALID Qty",qtyFmt(actual),"EULA PENDING dikecualikan"],
      ["Gap Qty",qtyFmt(qty-actual),"Target dikurangi realisasi"],
      ["Gap Amt",currency(amount-actualAmt),"Target dikurangi realisasi"],
      ["Target Daily Qty",qtyFmt(Math.ceil(dailyQty)),remaining+" hari tersisa · MTD "+elapsed+"/"+totalDays],
      ["Target Daily Amt",currency(Math.ceil(dailyAmt)),remaining+" hari tersisa"],
      ["AR Qty",percent(actual,qty),"Achievement Qty"],
      ["AR Amt",percent(actualAmt,amount),"Achievement Amount"]
    ]));
    mount.insertAdjacentHTML("beforeend",alert(remaining===0?
      "Periode telah berakhir; target harian tidak dihitung lagi.":
      "Target Daily = gap positif dibagi sisa hari kalender termasuk hari ini (MTD berjalan). Pembulatan Qty hanya pada tampilan."));
    makeTable(mount,{title:personal?"Rincian target EC":"Rincian target per toko",
      headers:["Site ID","Toko","Kategori","Target Qty","VALID Qty","Gap Qty","AR Qty","Target Amt","VALID Amt","Gap Amt","AR Amt"],
      rows,cells:r=>[r.site_id,r.site_name,r.category,qtyFmt(r.target_qty),qtyFmt(r.actual_qty),
        qtyFmt(r.target_qty-r.actual_qty),percent(r.actual_qty,r.target_qty),currency(r.target_amt),
        currency(r.actual_amt),currency(r.target_amt-r.actual_amt),percent(r.actual_amt,r.target_amt)],
      filename:personal?"target-ec.csv":"target-toko.csv"});
  }
  function coveragePage(mount,period,stores,targets,sales) {
    const rows=groupingTargets(stores,targets,sales);
    const bySite=new Map(rows.map(r=>[r.site_id,r]));
    const combined=stores.map(st=>{
      const r=bySite.get(st.site_id);return {...st,...(r||{
        target_qty:0,target_amt:0,actual_qty:0,actual_amt:0,pending:0,ar:0
      })};
    });
    mount.innerHTML=sectionHead("Coverage & Toko",
      "Daftar store yang dapat dibaca oleh akun. Pembatasan berasal dari Supabase RLS, bukan filter browser.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Store dalam coverage",nfmt(stores.length),"Store yang dapat diakses"],
      ["Store dengan target",nfmt(rows.length),"Target November"],
      ["Total Qty VALID",nfmt(sum(combined,"actual_qty")),"Transaksi tercatat"],
      ["PENDING",nfmt(sum(combined,"pending")),"Belum masuk pencapaian"]
    ]));
    makeTable(mount,{title:"Performa seluruh store coverage",
      subtitle:"Store tanpa target tetap ditampilkan, tidak dianggap memiliki target nol sebagai kegagalan.",
      headers:["Site ID","Toko","Kategori","Target Qty","Qty VALID","PENDING","AR Qty"],
      rows:combined,cells:r=>[
        r.site_id,r.site_name,r.channel_category||"—",
        bySite.has(r.site_id)?nfmt(r.target_qty):"Belum ada",
        nfmt(r.actual_qty),nfmt(r.pending),
        bySite.has(r.site_id)?percent(r.actual_qty,r.target_qty):"—"
      ],filename:"coverage-toko.csv"});
  }
  function rawPage(mount,period,sales,stores){
    const names=storeNames(stores),valid=sales.filter(r=>r.eula_status==="VALID"),pending=sales.filter(r=>r.eula_status==="PENDING");
    const display=[...pending,...valid].sort((a,b)=>b.sold_at.localeCompare(a.sold_at));
    mount.innerHTML=sectionHead("RAW Sellout Samsung",
      "Daftar IMEI/SN, model, tanggal, promoter, dan status EULA untuk data yang diizinkan RLS.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Total transaksi",nfmt(sales.length),"Tidak termasuk store di luar coverage"],
      ["EULA VALID",nfmt(valid.length),"Dihitung dalam achievement"],
      ["Qty VALID",nfmt(sum(valid,"qty")),"Total Qty realisasi"],
      ["EULA PENDING",nfmt(pending.length),"Belum dihitung"]
    ]));
    makeTable(mount,{title:"Transaksi Samsung",subtitle:"PENDING diprioritaskan dalam daftar. Unduhan CSV memuat semua transaksi yang terlihat oleh akun.",
      headers:["Tanggal","IMEI / SN","Site ID","Toko","Model","Promoter ID","Qty","Amt","Status"],
      rows:display,cells:r=>[r.sold_at,r.transaction_id,r.site_id,names.get(r.site_id)||r.site_id,
        r.model,r.promoter_id||"—",nfmt(r.qty),currency(r.amt),r.eula_status],
      filename:"sellout-"+period.period_start+".csv"});
  }
  function performancePage(mount,period,manpower,allocations,sales,stores) {
    const names=storeNames(stores),byId=new Map(allocations.map(a=>[a.manpower_id,a]));
    const actual=new Map();
    sales.filter(s=>s.eula_status==="VALID").forEach(s=>{
      const key=(s.site_id||"")+"|"+(s.promoter_id||"");
      const curr=actual.get(key)||{qty:0,amt:0};
      curr.qty+=num(s.qty);curr.amt+=num(s.amt);actual.set(key,curr);
    });
    const rows=manpower.filter(x=>x.fieldforce_position==="EC" && x.is_active).map(m=>{
      const a=byId.get(m.id)||{};
      const v=actual.get((m.site_id||"")+"|"+(m.promoter_id||""))||{qty:0,amt:0};
      return {employee_id:m.employee_id,full_name:m.full_name,promoter_id:m.promoter_id||"—",
        site_id:m.site_id||"—",site_name:names.get(m.site_id)||"—",
        target_qty:num(a.target_qty),target_amt:num(a.target_amt),qty:v.qty,amt:v.amt};
    }).sort((a,b)=>b.qty-a.qty);
    mount.innerHTML=sectionHead("Performa EC",
      "Achievement dihitung berdasarkan Promoter ID dan penempatan store. Hanya EC yang terlihat melalui RLS.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["EC terlihat",nfmt(rows.length),"Manpower aktif dalam scope"],
      ["Target EC Qty",nfmt(sum(rows,"target_qty")),"Alokasi personal"],
      ["VALID Qty",nfmt(sum(rows,"qty")),"Transaksi promoter yang cocok"],
      ["AR Qty",percent(sum(rows,"qty"),sum(rows,"target_qty")),"Tidak mencakup promotor Shadow"]
    ]));
    makeTable(mount,{title:"Produktivitas EC",
      headers:["Employee ID","Nama EC","Promoter ID","Store","Target Qty","VALID Qty","AR Qty","VALID Amt"],
      rows,cells:r=>[r.employee_id,r.full_name,r.promoter_id,r.site_name,
        nfmt(r.target_qty),nfmt(r.qty),percent(r.qty,r.target_qty),currency(r.amt)],
      filename:"performa-ec.csv"});
  }
  function shadowRate(model) {
    // Illustrative model eligibility only. Do not pay incentives from this estimate.
    const text=String(model||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(text.startsWith("GALAXYA07S")||text.startsWith("GALAXYA07"))return 25000;
    if(/^GALAXYA(0[8-9]|[1-9][0-9])/.test(text)||/^GALAXYS[0-9]/.test(text)||
      /^GALAXYZ(FLIP|FOLD)[0-9]/.test(text))return 50000;
    return null;
  }
  function shadowPage(mount,period,stores,history,sales){
    const names=mapById(stores),storeBySite=new Map(stores.map(s=>[s.site_id,s]));
    const active=new Set(history.filter(h=>h.is_shadow).map(h=>h.store_id));
    const valid=sales.filter(s=>s.eula_status==="VALID" && active.has(storeBySite.get(s.site_id)?.id));
    const estimate=valid.reduce((acc,s)=>acc+(shadowRate(s.model)||0)*num(s.qty),0);
    const eligible=valid.filter(s=>shadowRate(s.model)!==null);
    const counted=new Map();
    valid.forEach(s=>{
      const x=storeBySite.get(s.site_id);if(!x)return;
      const cur=counted.get(x.id)||{qty:0,eligible:0,estimate:0};
      cur.qty+=num(s.qty);
      const rate=shadowRate(s.model);if(rate!==null){cur.eligible+=num(s.qty);cur.estimate+=rate*num(s.qty);}
      counted.set(x.id,cur);
    });
    const rows=history.filter(h=>h.is_shadow).map(h=>{
      const store=names.get(h.store_id);if(!store)return null;
      const actual=counted.get(h.store_id)||{qty:0,eligible:0,estimate:0};
      return {site_id:store.site_id,site_name:store.site_name,category:store.channel_category||"—",...actual};
    }).filter(Boolean);
    mount.innerHTML=sectionHead("Store Shadow",
      "Status Shadow khusus bulan terpilih dan transaksi Samsung EULA VALID dari cakupan akses akun.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Store Shadow",nfmt(rows.length),"Dari data master shadow"],
      ["VALID Qty di Shadow",nfmt(sum(rows,"qty")),"Semua model tercatat"],
      ["Qty terindikasi eligible",nfmt(sum(rows,"eligible")),"Model ponsel terklasifikasi"],
      ["Simulasi insentif",currency(estimate),"Bukan nilai resmi untuk pembayaran"]
    ]));
    mount.insertAdjacentHTML("beforeend",alert("Simulasi: Galaxy A07/A07s Rp25.000, Galaxy A08 ke atas serta S/Z yang teridentifikasi Rp50.000 per unit VALID. Model yang tidak dikenali (termasuk tablet) tidak dihitung. Hasil ini belum menjadi perhitungan insentif resmi."));
    makeTable(mount,{title:"Shadow per store",
      headers:["Site ID","Toko","Kategori","VALID Qty","Qty terklasifikasi","Simulasi insentif"],
      rows,cells:r=>[r.site_id,r.site_name,r.category,nfmt(r.qty),nfmt(r.eligible),currency(r.estimate)],
      filename:"shadow-"+period.period_start+".csv"});
  }
  function focusPage(mount,period,settings,targets,stores,sales,profile,allocations,client,roster){
    const personal=profile.role==="ec";
    const names=mapById(stores),modelNames=new Map(settings.map(x=>[x.model_code,x.display_name]));
    // Individual EC allocations are mandatory: never substitute a store target for an EC target.
    const source=personal?(allocations||[]):targets;
    const grouped=new Map();
    for(const t of source){
      if(personal&&t.manpower_id!==profile.manpower_id)continue;
      const store=names.get(t.store_id);if(!store)continue;
      const key=store.site_id+"|"+t.model_code;
      if(!grouped.has(key))grouped.set(key,{site_id:store.site_id,site_name:store.site_name,
       model_code:t.model_code,model_name:modelNames.get(t.model_code)||t.model_code,
       target_qty:0,target_amt:0,actual_qty:0,actual_amt:0});
      const row=grouped.get(key);row.target_qty+=num(t.target_qty);row.target_amt+=num(t.target_amt);
    }
    const rows=[...grouped.values()];
    for(const row of rows){
      const valid=sales.filter(x=>String(x.eula_status||"").toUpperCase()==="VALID"&&x.site_id===row.site_id&&
       [row.model_code,row.model_name,"Galaxy "+row.model_code].some(label=>
         String(x.model||"").toUpperCase().replace(/[^A-Z0-9]/g,"")===
         String(label||"").toUpperCase().replace(/[^A-Z0-9]/g,"")));
      row.actual_qty=sum(valid,"qty");row.actual_amt=sum(valid,"amt");
    }
    const allocatedQty=sum(allocations||[],"target_qty"),allocatedAmt=sum(allocations||[],"target_amt");
    const targetQty=sum(rows,"target_qty"),actualQty=sum(rows,"actual_qty"),
      targetAmt=sum(rows,"target_amt"),actualAmt=sum(rows,"actual_amt");
    mount.innerHTML=sectionHead("Focus Model",personal?
      "Target khusus yang diberikan TL kepada EC dan pencapaian VALID personal.":
      "Total target model fokus dan pencapaian untuk cakupan TL.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Model fokus",qtyFmt(new Set(rows.map(x=>x.model_code)).size),"Model dengan target"],
      ["Target Qty",qtyFmt(targetQty),"Target tersimpan"],
      ["VALID Qty",qtyFmt(actualQty),"EULA VALID saja"],
      ["AR Qty",percent(actualQty,targetQty),"Achievement"],
      ["Gap Qty",qtyFmt(targetQty-actualQty),"Target dikurangi realisasi"],
      ["Gap Amt",currency(targetAmt-actualAmt),"Target dikurangi realisasi"],
      ...(!personal&&allocations?[["Alokasi Qty ke EC",qtyFmt(allocatedQty),"Total sudah dibagikan"],["Sisa alokasi Qty",qtyFmt(targetQty-allocatedQty),"Belum dibagikan kepada EC"],["Sisa alokasi Amt",currency(targetAmt-allocatedAmt),"Belum dibagikan kepada EC"]]:[])
    ]));
    if(profile.role==="tl"||profile.role==="admin"){
      const activeStores=new Set(stores.map(x=>x.id));
      const eligible=(roster||[]).filter(m=>m.is_active&&m.fieldforce_position==="EC"&&
        stores.some(st=>st.site_id===m.site_id));
      if(!allocations){
        mount.insertAdjacentHTML("beforeend",alert(
          "Form pembagian target dinonaktifkan sampai tabel alokasi Focus Model dan RLS aktif di staging."));
      }else if(eligible.length&&settings.length){
        const form=document.createElement("form");
        form.className="panel rounded-2xl p-4 sm:p-5 my-5 space-y-4";
        form.innerHTML='<h4 class="font-semibold">Bagikan Focus Model kepada EC</h4>'+
         '<p class="text-xs text-slate-400">Alokasi ditetapkan oleh TL untuk EC pada toko yang ditugaskan. Toko dan model dipilih dari data yang diizinkan.</p>'+
         '<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">'+
         '<label class="text-sm">EC<select data-ec required class="field block w-full rounded-lg p-2 mt-1">'+eligible.map(m=>
           '<option value="'+esc(m.id)+'">'+esc(m.full_name)+" · "+esc(m.employee_id)+'</option>').join("")+'</select></label>'+
         '<label class="text-sm">Model<select data-model required class="field block w-full rounded-lg p-2 mt-1">'+settings.filter(x=>x.is_active).map(x=>
           '<option value="'+esc(x.model_code)+'">'+esc(x.display_name)+'</option>').join("")+'</select></label>'+
         '<label class="text-sm">Target Qty<input data-qty class="field block w-full rounded-lg p-2 mt-1" type="number" min="0" step="0.001" required value="0"></label>'+
         '<label class="text-sm">Target Amt (Rp)<input data-amt class="field block w-full rounded-lg p-2 mt-1" type="number" min="0" step="0.01" required value="0"></label>'+
         '</div><p data-store class="text-xs text-cyan-300"></p>'+
         '<button data-submit type="submit" class="rounded-lg bg-cyan-500 text-slate-950 font-semibold px-5 py-2">Simpan alokasi EC</button>'+
         '<p data-status role="status" aria-live="polite" class="text-sm"></p>';
        mount.append(form);
        const ec=form.querySelector("[data-ec]"),model=form.querySelector("[data-model]"),
         qty=form.querySelector("[data-qty]"),amt=form.querySelector("[data-amt]"),
         status=form.querySelector("[data-status]"),submit=form.querySelector("[data-submit]");
        const getAssignedStore=()=>stores.find(st=>st.site_id===eligible.find(m=>m.id===ec.value)?.site_id);
        function sync(){
          const st=getAssignedStore();form.querySelector("[data-store]").textContent=
            st?"Toko: "+st.site_name+" · "+st.site_id:"Tidak ada toko aktif yang valid";
          const existing=(allocations||[]).find(x=>x.manpower_id===ec.value&&x.store_id===st?.id&&x.model_code===model.value);
          qty.value=existing?.target_qty??0;amt.value=existing?.target_amt??0;
        }
        ec.addEventListener("change",sync);model.addEventListener("change",sync);sync();
        form.addEventListener("submit",async event=>{
          event.preventDefault();
          const st=getAssignedStore(),q=Number(qty.value),a=Number(amt.value);
          if(!st||!activeStores.has(st.id)||!Number.isFinite(q)||!Number.isFinite(a)||q<0||a<0){
            status.textContent="Periksa EC, toko, target Qty dan Amount.";return;
          }
          const target=targets.find(t=>t.store_id===st.id&&t.model_code===model.value);
          const old=(allocations||[]).find(t=>t.manpower_id===ec.value&&t.store_id===st.id&&t.model_code===model.value);
          const allocated=(allocations||[]).filter(t=>t.store_id===st.id&&t.model_code===model.value&&t!==old);
          if(!target||sum(allocated,"target_qty")+q>num(target.target_qty)+0.000001||
             sum(allocated,"target_amt")+a>num(target.target_amt)+0.01){
            status.textContent="Alokasi melebihi total target model toko atau target toko belum ditetapkan.";return;
          }
          submit.disabled=true;status.textContent="Menyimpan alokasi...";
          try{
            const payload={period_id:period.id,manpower_id:ec.value,store_id:st.id,model_code:model.value,
              target_qty:q,target_amt:a,updated_by:profile.id};
            const mutation=old?
              client.from("focus_model_ec_targets").update({
                target_qty:q,target_amt:a,updated_by:profile.id
              }).eq("period_id",period.id).eq("manpower_id",ec.value).eq("store_id",st.id).eq("model_code",model.value):
              client.from("focus_model_ec_targets").insert(payload);
            const {data,error}=await mutation.select("manpower_id,store_id,model_code,target_qty,target_amt").single();
            if(error)throw error;
            if(!data)throw Error("Database tidak mengonfirmasi penyimpanan.");
            status.textContent="Alokasi tersimpan. Memuat ulang Focus Model...";
            await render({label:"Focus Model",client,profile,mount,period});
          }catch(err){status.textContent="Gagal menyimpan: "+(err.message||"Permintaan ditolak RLS.");}
          finally{submit.disabled=false;}
        });
      }
    }
    if(personal&&!allocations)mount.insertAdjacentHTML("beforeend",alert(
      "Alokasi Focus Model untuk EC belum diaktifkan. Total target toko tidak ditampilkan sebagai target personal."));
    if(!personal&&!allocations)mount.insertAdjacentHTML("beforeend",alert(
      "Target focus per toko tetap ditampilkan; alokasi personal EC menunggu aktivasi database."));
    makeTable(mount,{title:personal?"Focus Model Saya":"Total Target Focus Model",
      headers:["Site ID","Toko","Model","Target Qty","VALID Qty","Gap Qty","AR Qty","Target Amt","VALID Amt","Gap Amt"],
      rows,cells:r=>[r.site_id,r.site_name,r.model_name,qtyFmt(r.target_qty),qtyFmt(r.actual_qty),
       qtyFmt(r.target_qty-r.actual_qty),percent(r.actual_qty,r.target_qty),currency(r.target_amt),
       currency(r.actual_amt),currency(r.target_amt-r.actual_amt)],
      filename:personal?"focus-model-saya.csv":"focus-model-tl.csv"});
  }
  function reportPage(mount,period,sales,stores,targets,personal) {
    const valid=sales.filter(s=>s.eula_status==="VALID");
    const byModel=new Map();
    valid.forEach(s=>{
      const k=s.model||"Tidak diketahui",r=byModel.get(k)||{model:k,qty:0,amt:0};
      r.qty+=num(s.qty);r.amt+=num(s.amt);byModel.set(k,r);
    });
    const rows=[...byModel.values()].sort((a,b)=>b.qty-a.qty);
    const targetQty=sum(targets,"target_qty"),targetAmt=sum(targets,"target_amt");
    mount.innerHTML=sectionHead(personal?"Laporan Saya":"Laporan Performa",
      personal?"Ringkasan EC yang dibatasi Promoter ID oleh RLS.":"Ringkasan pencapaian EULA VALID berdasarkan model untuk scope akun.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Target Qty",nfmt(targetQty),"Periode saat ini"],
      ["Qty VALID",nfmt(sum(valid,"qty")),"Tidak termasuk PENDING"],
      ["AR Qty",percent(sum(valid,"qty"),targetQty),"Achievement Qty"],
      ["AR Amt",percent(sum(valid,"amt"),targetAmt),"Achievement Amt"]
    ]));
    mount.insertAdjacentHTML("beforeend",alert("Laporan ini menghitung transaksi VALID saja. Perhitungan WoW memerlukan data historis minggu pembanding yang lengkap."));
    makeTable(mount,{title:"Kontribusi penjualan per model",
      headers:["Model","VALID Qty","VALID Amt","Kontribusi Qty"],
      rows,cells:r=>[r.model,nfmt(r.qty),currency(r.amt),percent(r.qty,sum(valid,"qty"))],
      filename:"laporan-model.csv"});
  }
  async function render({label,client,profile,mount,period}) {
    if(!SECTIONS.has(label))return false;
    const token=++renderToken;
    mount.textContent="";
    mount.innerHTML='<div class="space-y-4" role="status" aria-live="polite">'+
      '<div class="skeleton rounded-2xl h-24"></div><div class="skeleton rounded-2xl h-64"></div></div>';
    try {
      nowPeriod(period);
      const loadSales=true;
      const loadTargets=["Coverage & Toko","Coverage","Target","Target Saya","Laporan","Laporan Saya"].includes(label);
      const loadManpower=label==="Performa EC"||(label==="Focus Model"&&["tl","admin"].includes(profile.role));
      const loadShadow=label==="Store Shadow";
      const loadFocus=label==="Focus Model";
      const personal=profile.role==="ec";
      const [stores,sales,targets,manpower,allocations,history,settings,focusTargets,ecFocusTargets]=await Promise.all([
        loadStores(client),
        loadSales?getSales(client,period):Promise.resolve([]),
        loadTargets?getTargets(client,period,personal,profile):Promise.resolve([]),
        loadManpower?all(client,"manpower","id,employee_id,full_name,promoter_id,site_id,fieldforce_position,is_active",q=>q.eq("is_active",true).eq("fieldforce_position","EC")):Promise.resolve([]),
        loadManpower?all(client,"ec_target_allocations","manpower_id,store_id,target_qty,target_amt",q=>q.eq("period_id",period.id)):Promise.resolve([]),
        loadShadow?all(client,"store_shadow_history","store_id,shadow_month,is_shadow",q=>q.eq("shadow_month",period.period_start.slice(0,7)+"-01")):Promise.resolve([]),
        loadFocus?all(client,"focus_model_settings","model_code,display_name,is_active",q=>q.order("display_name")):Promise.resolve([]),
        loadFocus?all(client,"focus_model_targets","store_id,model_code,target_qty,target_amt",q=>q.eq("period_id",period.id)):Promise.resolve([]),
        loadFocus?all(client,"focus_model_ec_targets","manpower_id,store_id,model_code,target_qty,target_amt",q=>q.eq("period_id",period.id)).catch(()=>null):Promise.resolve(null)
      ]);
      if(token!==renderToken || !mount.isConnected)return true;
      if(label==="Coverage & Toko"||label==="Coverage")coveragePage(mount,period,stores,targets,sales);
      else if(label==="Target"||label==="Target Saya")targetPage(mount,period,stores,targets,sales,personal);
      else if(label==="RAW Sellout")rawPage(mount,period,sales,stores);
      else if(label==="Performa EC")performancePage(mount,period,manpower,allocations,sales,stores);
      else if(label==="Store Shadow")shadowPage(mount,period,stores,history,sales);
      else if(label==="Focus Model")focusPage(mount,period,settings,focusTargets,stores,sales,profile,ecFocusTargets,client,manpower);
      else if(label==="Laporan"||label==="Laporan Saya")reportPage(mount,period,sales,stores,targets,personal);
    }catch(error){
      console.error("[SamsungOps]",error);
      if(token!==renderToken)return true;
      mount.innerHTML='<p role="alert" class="rounded-xl border border-rose-800 bg-rose-950/30 text-rose-200 p-5 text-sm">'+
        esc("Modul gagal dimuat: "+(error.message||"Koneksi bermasalah."))+'</p>';
    }
    return true;
  }
  window.SamsungOps={render,supports:label=>SECTIONS.has(label)};
})();