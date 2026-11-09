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
      '<div class="flex gap-2 flex-wrap items-center"><label class="text-xs text-slate-300">Kolom filter<select data-column class="field px-2 py-2 rounded-lg text-sm ml-2"><option value="-1">Semua kolom</option>'+
      headers.map((h,i)=>'<option value="'+i+'">'+esc(h)+'</option>').join("")+'</select></label>'+
      '<input data-search class="field px-3 py-2 rounded-lg text-sm min-w-0 w-40 sm:w-56" placeholder="Cari data…" aria-label="Cari baris tabel">'+
      '<button data-clear type="button" class="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-300">Reset</button>'+
      '<button data-export class="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-300 hover:bg-slate-800">Unduh CSV</button></div></div>'+
      '<div class="table-wrap"><table class="w-full text-sm"><thead><tr>'+
      headers.map(h=>'<th scope="col" class="text-left">'+esc(h)+'</th>').join("")+
      '</tr></thead><tbody data-body></tbody></table></div><p data-count class="text-xs text-slate-500 px-5 py-3"></p>';
    mount.append(box);
    const tbody=box.querySelector("[data-body]"),counter=box.querySelector("[data-count]");
    const search=box.querySelector("[data-search]"),exportBtn=box.querySelector("[data-export]");
    const columnSelect=box.querySelector("[data-column]"),clear=box.querySelector("[data-clear]");
    let filtered=rows;
    function paint(){
      const term=search.value.toLocaleLowerCase("id-ID").trim();
      const col=Number(columnSelect.value);
      filtered=term?rows.filter(row=>{
       const fields=cells(row);
       const selected=col<0?fields:[fields[col]];
       return selected.some(v=>String(v??"").toLocaleLowerCase("id-ID").includes(term));
      }):rows;
      tbody.innerHTML=filtered.slice(0,150).map(row=>
        '<tr>'+cells(row).map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>'
      ).join("")||'<tr><td colspan="'+headers.length+'" class="text-center text-slate-500 py-8">Tidak ada data pada pencarian ini.</td></tr>';
      counter.textContent=formatter.format(filtered.length)+" baris"+(filtered.length>150?" · 150 baris pertama ditampilkan (CSV memuat semua)":"");
    }
    search.addEventListener("input",paint);
    columnSelect.addEventListener("change",paint);
    clear.addEventListener("click",()=>{search.value="";columnSelect.value="-1";paint()});
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
  function monthProgress(period){
    const now=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Pontianak",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const day=date=>Math.floor(Date.parse(date+"T12:00:00Z")/86400000);
    const total=Math.max(1,day(period.period_end)-day(period.period_start)+1);
    const elapsed=Math.max(0,Math.min(total,day(now)-day(period.period_start)+1));
    return {total,elapsed,remaining:Math.max(0,total-elapsed),today:now};
  }
  const qtyRounded=v=>Math.round(num(v));
  const qtyText=v=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(qtyRounded(v));
  function targetPage(mount,period,stores,targets,sales,personal) {
    const rows=groupingTargets(stores,targets,sales);
    const qty=sum(rows,"target_qty"),amount=sum(rows,"target_amt"),actual=sum(rows,"actual_qty"),actualAmt=sum(rows,"actual_amt");
    const timeline=monthProgress(period);
    const gapQty=qty-actual,gapAmt=amount-actualAmt;
    const mtdQty=timeline.total>0?qty*timeline.elapsed/timeline.total:0;
    const dailyQty=timeline.remaining>0?Math.ceil(Math.max(0,gapQty)/timeline.remaining):0;
    const dailyAmt=timeline.remaining>0?Math.ceil(Math.max(0,gapAmt)/timeline.remaining):0;
    mount.innerHTML=sectionHead(personal?"Target Saya":"Target Penjualan",
      personal?"Target pribadi EC dan sellout VALID berdasarkan akses akun.":"Target toko dalam cakupan akun.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Target Qty",qtyText(qty),"Dibulatkan untuk tampilan; sumber tetap utuh"],
      ["Sellout VALID",qtyText(actual),"PENDING tidak dihitung"],
      ["Gap Qty",qtyText(gapQty),"Target dikurangi pencapaian"],
      ["Gap Amt",currency(gapAmt),"Target dikurangi pencapaian"]
    ]));
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Target Amt",currency(amount),"Target nominal periode"],
      ["Pencapaian Amt",currency(actualAmt),"Transaksi EULA VALID"],
      ["Target MTD Qty",qtyText(mtdQty),"Pace linear hingga "+timeline.today],
      ["Daily Qty / Amt",qtyText(dailyQty)+" unit · "+currency(dailyAmt),"Kebutuhan per sisa "+timeline.remaining+" hari kalender"]
    ]));
    mount.insertAdjacentHTML("beforeend",alert("MTD dihitung linear mengikuti hari kalender periode target. Daily Qty/Amt adalah kebutuhan per hari tersisa untuk menutup gap, bukan target resmi baru. Qty ditampilkan sebagai bilangan bulat; data sumber tidak diubah."));
    makeTable(mount,{title:personal?"Rincian Target EC":"Rincian target per toko",
      headers:["Site ID","Toko","Kategori","Target Qty","VALID Qty","Gap Qty","AR Qty","Target Amt","VALID Amt","Gap Amt","AR Amt"],
      rows,cells:r=>[r.site_id,r.site_name,r.category,qtyText(r.target_qty),qtyText(r.actual_qty),
        qtyText(r.target_qty-r.actual_qty),percent(r.actual_qty,r.target_qty),currency(r.target_amt),
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
  const normModel=x=>String(x||"").trim().toUpperCase().replace(/^(SAMSUNG\\s+)?GALAXY\\s+/,"").replace(/\\s+/g," ");
  function modelMatches(sold,code,name){
    const a=normModel(sold),keys=[code,name].map(normModel).filter(Boolean);
    return keys.some(key=>a===key||a.startsWith(key+" ")||key.startsWith(a+" "));
  }
  function focusPage(mount,period,settings,targets,stores,sales,profile){
    const names=mapById(stores),modelMap=new Map(settings.map(s=>[s.model_code,s]));
    const valid=sales.filter(s=>String(s.eula_status||"").toUpperCase()==="VALID");
    const rows=targets.map(row=>{
      const st=names.get(row.store_id),setting=modelMap.get(row.model_code);
      if(!st || (setting && !setting.is_active))return null;
      const closing=valid.filter(s=>s.site_id===st.site_id&&modelMatches(s.model,row.model_code,setting?.display_name));
      return {...row,site_id:st.site_id,site_name:st.site_name,
        model_name:setting?.display_name||row.model_code,actual_qty:sum(closing,"qty"),actual_amt:sum(closing,"amt")};
    }).filter(Boolean);
    const totalTarget=sum(rows,"target_qty"),totalActual=sum(rows,"actual_qty");
    const personal=profile.role==="ec";
    mount.innerHTML=sectionHead("Focus Model",
      personal?"Hanya alokasi Focus Model pribadi dari TL, dengan sellout VALID yang terlihat oleh akun EC.":"Total target fokus model yang ditetapkan pada toko dalam cakupan TL/role beserta pencapaian VALID.",period);
    mount.insertAdjacentHTML("beforeend",kpiPanel([
      ["Model fokus",nfmt(new Set(rows.map(x=>x.model_code)).size),"Model yang memiliki target"],
      [personal?"Target pribadi dari TL":"Total target ditetapkan",qtyText(totalTarget),"Qty untuk cakupan akun"],
      ["Pencapaian Qty",qtyText(totalActual),"Model terpadankan · EULA VALID"],
      ["Gap Qty",qtyText(totalTarget-totalActual),"AR "+percent(totalActual,totalTarget)]
    ]));
    mount.insertAdjacentHTML("beforeend",alert(personal
      ?"Hanya target fokus EC yang dialokasikan TL ditampilkan. Jika belum ada alokasi pribadi, mintalah TL mengaturnya. Pencapaian berdasarkan transaksi VALID yang diizinkan RLS."
      :"Pencapaian dihitung dari RAW Sellout VALID berdasarkan toko dan padanan model; cocokkan nama/varian yang belum terpetakan dengan Admin. Tidak ada hak mengubah target pada halaman ini."));
    makeTable(mount,{title:personal?"Focus Model toko & pencapaian EC":"Total Focus Model dan Pencapaian",
      headers:["Site ID","Toko","Model","Target Qty","VALID Qty","Gap Qty","AR Qty","Target Amt","VALID Amt","AR Amt"],
      rows,cells:r=>[r.site_id,r.site_name,r.model_name,qtyText(r.target_qty),qtyText(r.actual_qty),
        qtyText(r.target_qty-r.actual_qty),percent(r.actual_qty,r.target_qty),currency(r.target_amt),
        currency(r.actual_amt),percent(r.actual_amt,r.target_amt)],
      filename:personal?"focus-ec.csv":"focus-tl.csv"});
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
      const loadManpower=label==="Performa EC";
      const loadShadow=label==="Store Shadow";
      const loadFocus=label==="Focus Model";
      const personal=profile.role==="ec";
      const [stores,sales,targets,manpower,allocations,history,settings,focusTargets,focusAllocations]=await Promise.all([
        loadStores(client),
        loadSales?getSales(client,period):Promise.resolve([]),
        loadTargets?getTargets(client,period,personal,profile):Promise.resolve([]),
        loadManpower?all(client,"manpower","id,employee_id,full_name,promoter_id,site_id,fieldforce_position,is_active",q=>q.eq("is_active",true).eq("fieldforce_position","EC")):Promise.resolve([]),
        loadManpower?all(client,"ec_target_allocations","manpower_id,store_id,target_qty,target_amt",q=>q.eq("period_id",period.id)):Promise.resolve([]),
        loadShadow?all(client,"store_shadow_history","store_id,shadow_month,is_shadow",q=>q.eq("shadow_month",period.period_start.slice(0,7)+"-01")):Promise.resolve([]),
        loadFocus?all(client,"focus_model_settings","model_code,display_name,is_active",q=>q.order("display_name")):Promise.resolve([]),
        loadFocus&&profile.role!=="ec"?all(client,"focus_model_targets","store_id,model_code,target_qty,target_amt",q=>q.eq("period_id",period.id)):Promise.resolve([]),
        loadFocus&&profile.role==="ec"?all(client,"focus_model_ec_targets","store_id,manpower_id,model_code,target_qty,target_amt",q=>q.eq("period_id",period.id).eq("manpower_id",profile.manpower_id)).catch(error=>{
         if(/(does not exist|not found|schema cache|PGRST205|42P01)/i.test(error.message||""))return [];
         throw error;
        }):Promise.resolve([])
      ]);
      if(token!==renderToken || !mount.isConnected)return true;
      if(label==="Coverage & Toko"||label==="Coverage")coveragePage(mount,period,stores,targets,sales);
      else if(label==="Target"||label==="Target Saya")targetPage(mount,period,stores,targets,sales,personal);
      else if(label==="RAW Sellout")rawPage(mount,period,sales,stores);
      else if(label==="Performa EC")performancePage(mount,period,manpower,allocations,sales,stores);
      else if(label==="Store Shadow")shadowPage(mount,period,stores,history,sales);
      else if(label==="Focus Model")focusPage(mount,period,settings,profile.role==="ec"?focusAllocations:focusTargets,stores,sales,profile);
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