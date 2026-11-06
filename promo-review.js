/* Samsung Kalteng — Admin-only clarification queue for internal bulletin drafts.
 * Drafts remain unpublished until an Admin supplies corrected terms + evidence. */
(function () {
  "use strict";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g,
    char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const channels = {
    all:"Semua channel",offline:"Traditional & Organized",
    traditional:"Traditional",organized:"Organized",
    e_store:"E-Store",online:"Online",unspecified:"Belum ditetapkan"
  };
  const ambiguous = /apple\s+adaptor|harga\s+belum\s+final|perlu\s+klarifikasi|belum\s+diterima|buds\s+score/i;
  function validate(record,form,storeMap) {
    const errors = [];
    if (!form.confirmed) errors.push("Centang pernyataan verifikasi Admin.");
    if (form.evidence.length < 25) errors.push("Bukti klarifikasi minimal 25 karakter.");
    if (form.model.length < 3 || form.model.length > 160) errors.push("Model harus jelas.");
    if (form.variant.length < 2 || form.variant.length > 200) errors.push("Varian harus jelas.");
    if (form.benefit.length < 4 || form.benefit.length > 600) errors.push("Benefit harus jelas.");
    if (form.terms.length > 2500) errors.push("Syarat terlalu panjang.");
    if (!Object.hasOwn(channels, form.channel)) errors.push("Channel tidak valid.");
    if (!Array.isArray(form.items) || !form.items.length || form.items.length > 20) {
      errors.push("Benefit terstruktur wajib berupa JSON array berisi 1–20 item.");
    } else {
      for (const item of form.items) {
        if (!item || typeof item !== "object" || Array.isArray(item) ||
            typeof item.name !== "string" || !item.name.trim()) {
          errors.push("Setiap item benefit harus punya nama."); break;
        }
        if (["amount_idr","price_idr","estimated_value_idr","percent"].some(key =>
            item[key] != null && (!Number.isFinite(Number(item[key])) || Number(item[key]) < 0))) {
          errors.push("Nominal benefit harus angka positif."); break;
        }
      }
    }
    const labels = [form.model,form.variant,form.benefit].concat(
      Array.isArray(form.items) ? form.items.map(item => item?.name || "") : []);
    if (labels.some(label => ambiguous.test(label))) errors.push("Ada benefit atau SKU ambigu yang belum dikoreksi.");
    const sites = [...new Set(form.siteIds)];
    if (sites.some(site => !storeMap.has(site))) errors.push("Site ID belum terdaftar pada coverage.");
    if (record.import_key === "master-20261030-a57-xl-pending" && !sites.length) {
      errors.push("Daftar Site ID XL Prioritas yang sudah diverifikasi wajib diisi.");
    }
    if (record.import_key === "master-20261030-a17-lte-8-128-price" &&
        !(Array.isArray(form.items) && form.items.some(item => Number(item?.price_idr) > 0))) {
      errors.push("Harga A17 LTE 8/128GB harus memuat price_idr yang sudah dikonfirmasi.");
    }
    return {errors, sites, scope:sites.length ? "selected_stores":"national"};
  }
  function render(ctx, mount, promos, stores, relations, reload) {
    if (ctx.profile?.role !== "admin" || !mount) return;
    const drafts = promos.filter(row => row.requires_review && !row.published &&
      row.source_type === "internal_bulletin");
    mount.innerHTML = '<div class="intel-review-head"><p class="intel-overline">Admin · Quality Assurance</p>'+
      '<h3>Antrean Klarifikasi Promo</h3><p>'+drafts.length+
      ' item menunggu konfirmasi. Simpan koreksi tidak menerbitkan promo.</p></div>'+
      '<div class="intel-review-fields">'+
      '<label>Promo yang perlu diklarifikasi<select id="review-item" class="field"></select></label>'+
      '<label>Model<input id="review-model" class="field" maxlength="160"></label>'+
      '<label>Varian<input id="review-variant" class="field" maxlength="200"></label>'+
      '<label>Channel<select id="review-channel" class="field"></select></label>'+
      '<label class="intel-full">Benefit<textarea id="review-benefit" class="field" rows="3" maxlength="600"></textarea></label>'+
      '<label class="intel-full">Syarat dan ketentuan<textarea id="review-terms" class="field" rows="3" maxlength="2500"></textarea></label>'+
      '<label class="intel-full">Detail benefit terstruktur (JSON: name, amount_idr, price_idr, percent)<textarea id="review-items" class="field intel-review-json" rows="6" spellcheck="false"></textarea></label>'+
      '<label class="intel-full">Site ID toko berlaku (pisahkan koma, wajib untuk XL Prioritas)<textarea id="review-sites" class="field" rows="2" placeholder="SITE001, SITE002"></textarea></label>'+
      '<label class="intel-full">Bukti klarifikasi / sumber internal terkonfirmasi<textarea id="review-evidence" class="field" rows="3" maxlength="2000" placeholder="Nomor memo internal, tanggal, penanggung jawab, dan rincian yang sudah diperiksa"></textarea></label>'+
      '<label class="intel-full intel-review-check"><input type="checkbox" id="review-confirm"> Saya sudah memeriksa SKU, nominal, channel, syarat, dan bukti. Sumber tetap bulletin internal.</label>'+
      '</div><p id="review-original" class="intel-caption"></p>'+
      '<div class="intel-review-actions"><button type="button" class="intel-action intel-action-subtle" id="review-save">Simpan koreksi sebagai draft</button>'+
      '<button type="button" class="intel-action intel-action-primary" id="review-approve">Setujui & terbitkan</button></div>'+
      '<p id="review-result" role="status" aria-live="polite" class="intel-review-message"></p>';
    const $ = id => mount.querySelector("#"+id);
    const select = $("review-item"), channelSelect = $("review-channel");
    for (const draft of drafts) {
      const option = document.createElement("option");
      option.value = draft.id;
      option.textContent = draft.model_name+" · "+draft.sku_variant;
      select.appendChild(option);
    }
    for (const [key,text] of Object.entries(channels)) {
      const option = document.createElement("option");
      option.value = key; option.textContent = text; channelSelect.appendChild(option);
    }
    const mapBySite = new Map(stores.map(s => [s.site_id,s.id]));
    const mapById = new Map(stores.map(s => [s.id,s.site_id]));
    const current = () => drafts.find(row => row.id === select.value);
    function loadDraft(){
      const row=current();
      if (!row) { $("review-original").textContent="Tidak ada promo menunggu klarifikasi."; $("review-save").disabled=true; $("review-approve").disabled=true; return; }
      $("review-model").value=row.model_name||"";
      $("review-variant").value=row.sku_variant||"Semua varian";
      channelSelect.value=row.channel_code||"unspecified";
      $("review-benefit").value=row.benefit||"";
      $("review-terms").value=row.terms||"";
      $("review-items").value=JSON.stringify(row.offer_items||[],null,2);
      $("review-evidence").value=row.review_evidence||"";
      $("review-sites").value=(relations.get(row.id)||[]).map(id=>mapById.get(id)).filter(Boolean).join(", ");
      $("review-confirm").checked=false;
      $("review-original").textContent="Sumber asli: "+(row.source_reference||"Bulletin internal")+" · "+(row.import_key||"");
      $("review-result").textContent="";
    }
    select.addEventListener("change",loadDraft);
    loadDraft();
    function values(){
      let items;
      try {items=JSON.parse($("review-items").value);} catch {throw Error("Format JSON benefit salah. Periksa kurung, koma dan tanda kutip.");}
      return {
        model:$("review-model").value.trim(),variant:$("review-variant").value.trim(),
        channel:channelSelect.value,benefit:$("review-benefit").value.trim(),
        terms:$("review-terms").value.trim(),items,
        siteIds:$("review-sites").value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean),
        evidence:$("review-evidence").value.trim(),confirmed:$("review-confirm").checked
      };
    }
    function updateData(v,scope){
      const title=(v.model+" · "+v.variant+" · "+channels[v.channel]).slice(0,160);
      return {
        title,model_code:v.model.toUpperCase(),model_name:v.model,
        sku_variant:v.variant,channel_code:v.channel,channel_label:channels[v.channel],
        benefit:v.benefit,terms:v.terms,offer_items:v.items,scope_type:scope,
        review_evidence:v.evidence,updated_at:new Date().toISOString(),updated_by:ctx.profile.id
      };
    }
    async function proceed(publish){
      const buttons=[$("review-save"),$("review-approve")];
      buttons.forEach(button=>button.disabled=true);
      const output=$("review-result");
      try {
        const row=current();if(!row)throw Error("Tidak ada draft.");
        const v=values();
        const basic=validate(row,{...v,confirmed:true,evidence:"Bukti draft tidak perlu persetujuan."},mapBySite);
        const basicErrors=basic.errors.filter(err=>!err.includes("ambig") &&
          !err.includes("harga") && !err.includes("Harga") &&
          !err.includes("XL Prioritas"));
        if(basicErrors.length)throw Error(basicErrors.join(" "));
        const checked=validate(row,v,mapBySite);
        if(publish && checked.errors.length)throw Error(checked.errors.join(" "));
        // Two-phase safety: corrections persist as a PRIVATE draft first.
        const data=updateData(v,basic.scope);
        const {data:saved,error}=await ctx.client.from("sales_promotions")
          .update({...data,published:false,requires_review:true,verification_state:"draft"})
          .eq("id",row.id).eq("published",false).eq("requires_review",true).select("id");
        if(error)throw Error(error.message);
        if(!saved?.length)throw Error("Draft telah berubah. Muat ulang dan periksa kembali.");
        if(publish){
          if(checked.sites.length){
            const links=checked.sites.map(site=>({promo_id:row.id,store_id:mapBySite.get(site)}));
            const {error:linkError}=await ctx.client.from("sales_promotion_stores")
              .upsert(links,{onConflict:"promo_id,store_id"});
            if(linkError)throw Error("Cakupan toko gagal disimpan; draft tetap tidak terbit. "+linkError.message);
          }
          const now=new Date().toISOString();
          const {data:approved,error:approveError}=await ctx.client.from("sales_promotions")
            .update({published:true,requires_review:false,verification_state:"verified",
              verified_basis:"bulletin_admin_review",verified_at:now,
              reviewed_at:now,reviewed_by:ctx.profile.id,review_evidence:v.evidence,
              updated_at:now,updated_by:ctx.profile.id})
            .eq("id",row.id).eq("published",false).eq("requires_review",true).select("id");
          if(approveError)throw Error("Penerbitan gagal; draft tetap aman. "+approveError.message);
          if(!approved?.length)throw Error("Draft berubah; cek status sebelum menyetujui.");
          output.textContent="Review disetujui dan promo telah diterbitkan sebagai bulletin internal.";
          reload();
        } else {
          output.textContent="Koreksi tersimpan sebagai draft; belum diterbitkan.";
        }
      } catch(err) {
        output.textContent=err.message||"Gagal menyimpan.";
        output.classList.add("error");
      } finally {
        buttons.forEach(button=>button.disabled=false);
      }
    }
    $("review-save").addEventListener("click",()=>proceed(false));
    $("review-approve").addEventListener("click",()=>proceed(true));
  }
  window.PromoReview={render,validate};
})();