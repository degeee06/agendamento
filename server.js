// Atualizar status (ex: cancelado, atendido, etc.)
app.post("/status/:cliente/:id", authMiddleware, async (req, res) => {
  try {
    const cliente = req.params.cliente;
    if (req.clienteId !== cliente) return res.status(403).json({ msg: "Acesso negado" });

    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ msg: "Status obrigatório" });

    // Atualiza no Supabase
    const { data, error } = await supabase
      .from("agendamentos")
      .update({ status })
      .eq("id", id)
      .eq("cliente", cliente)
      .select()
      .single();

    if (error) return res.status(500).json({ msg: "Erro ao atualizar status" });
    if (!data) return res.status(404).json({ msg: "Agendamento não encontrado" });

    // Atualiza no Google Sheets
    const doc = await accessSpreadsheet(cliente);
    const sheet = doc.sheetsByIndex[0];
    await ensureDynamicHeaders(sheet, Object.keys(data));

    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("id") === data.id);

    if (row) {
      row.set("status", status);
      await row.save();
    }

    res.json({ msg: `✅ Status atualizado para ${status}`, agendamento: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "❌ Erro interno" });
  }
});
