#!/usr/bin/env python3
# v2.6.0 i18n: 43 keys (tasks / budget / help shortcuts) after 'mu.decErr' in all 8 blocks.
import io, re

LANGS = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'hi', 'ar']
KEYS = [
    "app.tasks", "app.budget",
    "tk.add", "tk.due", "tk.prio", "tk.p0", "tk.p1", "tk.p2",
    "tk.fAll", "tk.fToday", "tk.fOverdue", "tk.fDone", "tk.empty", "tk.open", "tk.clearDone",
    "bg.amount", "bg.typeIn", "bg.typeOut", "bg.cat", "bg.desc", "bg.date", "bg.add",
    "bg.income", "bg.expense", "bg.net", "bg.empty", "bg.cats", "bg.needAmt",
    "help.menu", "help.title", "help.g1", "help.g2",
    "help.spot", "help.mission", "help.lock", "help.newNote", "help.newTerm", "help.wall",
    "help.min", "help.move", "help.resize", "help.menus", "help.tour", "help.note",
]
assert len(KEYS) == 44, len(KEYS)

T = {
"en": {
"app.tasks": "Tasks", "app.budget": "Budget",
"tk.add": "Add a task and press Enter…", "tk.due": "Due", "tk.prio": "Priority",
"tk.p0": "Low", "tk.p1": "Normal", "tk.p2": "High",
"tk.fAll": "All", "tk.fToday": "Today", "tk.fOverdue": "Overdue", "tk.fDone": "Done",
"tk.empty": "Nothing here — add a task above.", "tk.open": "%d open", "tk.clearDone": "Clear done",
"bg.amount": "Amount", "bg.typeIn": "Income", "bg.typeOut": "Expense", "bg.cat": "Category",
"bg.desc": "Description", "bg.date": "Date", "bg.add": "Add",
"bg.income": "Income", "bg.expense": "Expenses", "bg.net": "Net this month",
"bg.empty": "No transactions yet — add one above.",
"bg.cats": "Food|Transport|Housing|Utilities|Health|Other",
"bg.needAmt": "Enter an amount greater than zero.",
"help.menu": "Shortcuts", "help.title": "Keyboard shortcuts",
"help.g1": "System", "help.g2": "Window",
"help.spot": "Spotlight search", "help.mission": "Mission Control", "help.lock": "Lock screen",
"help.newNote": "New note", "help.newTerm": "New terminal", "help.wall": "Next wallpaper",
"help.min": "Minimize / Zoom", "help.move": "Move window (focus title bar)",
"help.resize": "Resize window", "help.menus": "Navigate menus", "help.tour": "Tour / dialogs",
"help.note": "Tip: in the menubar, arrow keys move between menus and items; Enter runs the highlighted item.",
},
"es": {
"app.tasks": "Tareas", "app.budget": "Presupuesto",
"tk.add": "Añade una tarea y pulsa Enter…", "tk.due": "Vence", "tk.prio": "Prioridad",
"tk.p0": "Baja", "tk.p1": "Normal", "tk.p2": "Alta",
"tk.fAll": "Todas", "tk.fToday": "Hoy", "tk.fOverdue": "Atrasadas", "tk.fDone": "Hechas",
"tk.empty": "Nada por aquí — añade una tarea arriba.", "tk.open": "%d abiertas", "tk.clearDone": "Borrar hechas",
"bg.amount": "Importe", "bg.typeIn": "Ingreso", "bg.typeOut": "Gasto", "bg.cat": "Categoría",
"bg.desc": "Descripción", "bg.date": "Fecha", "bg.add": "Añadir",
"bg.income": "Ingresos", "bg.expense": "Gastos", "bg.net": "Balance del mes",
"bg.empty": "Aún no hay movimientos — añade uno arriba.",
"bg.cats": "Comida|Transporte|Vivienda|Servicios|Salud|Otro",
"bg.needAmt": "Introduce un importe mayor que cero.",
"help.menu": "Atajos", "help.title": "Atajos de teclado",
"help.g1": "Sistema", "help.g2": "Ventana",
"help.spot": "Búsqueda Spotlight", "help.mission": "Control de misiones", "help.lock": "Bloquear pantalla",
"help.newNote": "Nota nueva", "help.newTerm": "Terminal nueva", "help.wall": "Siguiente fondo",
"help.min": "Minimizar / Acercar", "help.move": "Mover ventana (enfoca la barra de título)",
"help.resize": "Redimensionar ventana", "help.menus": "Navegar menús", "help.tour": "Tour / diálogos",
"help.note": "Consejo: en la barra de menús, las flechas mueven entre menús e ítems; Enter ejecuta el ítem resaltado.",
},
"fr": {
"app.tasks": "Tâches", "app.budget": "Budget",
"tk.add": "Ajoutez une tâche puis appuyez sur Entrée…", "tk.due": "Échéance", "tk.prio": "Priorité",
"tk.p0": "Basse", "tk.p1": "Normale", "tk.p2": "Haute",
"tk.fAll": "Toutes", "tk.fToday": "Aujourd'hui", "tk.fOverdue": "En retard", "tk.fDone": "Terminées",
"tk.empty": "Rien ici — ajoutez une tâche ci-dessus.", "tk.open": "%d ouvertes", "tk.clearDone": "Effacer les terminées",
"bg.amount": "Montant", "bg.typeIn": "Revenu", "bg.typeOut": "Dépense", "bg.cat": "Catégorie",
"bg.desc": "Description", "bg.date": "Date", "bg.add": "Ajouter",
"bg.income": "Revenus", "bg.expense": "Dépenses", "bg.net": "Solde du mois",
"bg.empty": "Aucune transaction — ajoutez-en une ci-dessus.",
"bg.cats": "Repas|Transport|Logement|Services|Santé|Autre",
"bg.needAmt": "Saisissez un montant supérieur à zéro.",
"help.menu": "Raccourcis", "help.title": "Raccourcis clavier",
"help.g1": "Système", "help.g2": "Fenêtre",
"help.spot": "Recherche Spotlight", "help.mission": "Contrôle des missions", "help.lock": "Verrouiller l'écran",
"help.newNote": "Nouvelle note", "help.newTerm": "Nouveau terminal", "help.wall": "Fond d'écran suivant",
"help.min": "Réduire / Agrandir", "help.move": "Déplacer la fenêtre (cibler la barre de titre)",
"help.resize": "Redimensionner la fenêtre", "help.menus": "Naviguer dans les menus", "help.tour": "Tour / dialogues",
"help.note": "Astuce : dans la barre de menus, les flèches déplacent entre menus et éléments ; Entrée exécute l'élément surligné.",
},
"de": {
"app.tasks": "Aufgaben", "app.budget": "Budget",
"tk.add": "Aufgabe hinzufügen und Enter drücken…", "tk.due": "Fällig", "tk.prio": "Priorität",
"tk.p0": "Niedrig", "tk.p1": "Normal", "tk.p2": "Hoch",
"tk.fAll": "Alle", "tk.fToday": "Heute", "tk.fOverdue": "Überfällig", "tk.fDone": "Erledigt",
"tk.empty": "Hier nichts — füge oben eine Aufgabe hinzu.", "tk.open": "%d offen", "tk.clearDone": "Erledigte löschen",
"bg.amount": "Betrag", "bg.typeIn": "Einkommen", "bg.typeOut": "Ausgabe", "bg.cat": "Kategorie",
"bg.desc": "Beschreibung", "bg.date": "Datum", "bg.add": "Hinzufügen",
"bg.income": "Einnahmen", "bg.expense": "Ausgaben", "bg.net": "Bilanz des Monats",
"bg.empty": "Noch keine Buchungen — füge oben eine hinzu.",
"bg.cats": "Essen|Transport|Wohnen|Nebenkosten|Gesundheit|Sonstiges",
"bg.needAmt": "Gib einen Betrag größer als null ein.",
"help.menu": "Tastenkürzel", "help.title": "Tastenkürzel",
"help.g1": "System", "help.g2": "Fenster",
"help.spot": "Spotlight-Suche", "help.mission": "Mission Control", "help.lock": "Bildschirm sperren",
"help.newNote": "Neue Notiz", "help.newTerm": "Neues Terminal", "help.wall": "Nächster Hintergrund",
"help.min": "Minimieren / Zoom", "help.move": "Fenster verschieben (Titelfeld fokussieren)",
"help.resize": "Fenstergröße ändern", "help.menus": "Menüs navigieren", "help.tour": "Tour / Dialoge",
"help.note": "Tipp: In der Leiste bewegen die Pfeiltasten zwischen Menüs und Einträgen; Enter führt den markierten Eintrag aus.",
},
"pt": {
"app.tasks": "Tarefas", "app.budget": "Orçamento",
"tk.add": "Adicione uma tarefa e pressione Enter…", "tk.due": "Vence", "tk.prio": "Prioridade",
"tk.p0": "Baixa", "tk.p1": "Normal", "tk.p2": "Alta",
"tk.fAll": "Todas", "tk.fToday": "Hoje", "tk.fOverdue": "Atrasadas", "tk.fDone": "Feitas",
"tk.empty": "Nada por aqui — adicione uma tarefa acima.", "tk.open": "%d abertas", "tk.clearDone": "Limpar feitas",
"bg.amount": "Valor", "bg.typeIn": "Receita", "bg.typeOut": "Despesa", "bg.cat": "Categoria",
"bg.desc": "Descrição", "bg.date": "Data", "bg.add": "Adicionar",
"bg.income": "Receitas", "bg.expense": "Despesas", "bg.net": "Saldo do mês",
"bg.empty": "Nenhuma transação — adicione uma acima.",
"bg.cats": "Comida|Transporte|Mora|Contas|Saúde|Outro",
"bg.needAmt": "Informe um valor maior que zero.",
"help.menu": "Atalhos", "help.title": "Atalhos de teclado",
"help.g1": "Sistema", "help.g2": "Janela",
"help.spot": "Busca Spotlight", "help.mission": "Controle de missões", "help.lock": "Bloquear tela",
"help.newNote": "Nova nota", "help.newTerm": "Novo terminal", "help.wall": "Próximo papel de parede",
"help.min": "Minimizar / Ampliar", "help.move": "Mover janela (focar a barra de título)",
"help.resize": "Redimensionar janela", "help.menus": "Navegar menus", "help.tour": "Tour / diálogos",
"help.note": "Dica: na barra de menus, as setas movem entre menus e itens; Enter executa o item destacado.",
},
"ja": {
"app.tasks": "タスク", "app.budget": "家計簿",
"tk.add": "タスクを追加して Enter…", "tk.due": "期日", "tk.prio": "優先度",
"tk.p0": "低", "tk.p1": "普通", "tk.p2": "高",
"tk.fAll": "すべて", "tk.fToday": "今日", "tk.fOverdue": "期限切れ", "tk.fDone": "完了",
"tk.empty": "まだありません — 上からタスクを追加。", "tk.open": "%d件 未完了", "tk.clearDone": "完了を消去",
"bg.amount": "金額", "bg.typeIn": "収入", "bg.typeOut": "支出", "bg.cat": "カテゴリ",
"bg.desc": "説明", "bg.date": "日付", "bg.add": "追加",
"bg.income": "収入", "bg.expense": "支出", "bg.net": "今月の差額",
"bg.empty": "取引はまだありません — 上から追加。",
"bg.cats": "食費|交通費|住居|光熱費|医療|その他",
"bg.needAmt": "ゼロより大きい金額を入力してください。",
"help.menu": "ショートカット", "help.title": "キーボードショートカット",
"help.g1": "システム", "help.g2": "ウィンドウ",
"help.spot": "Spotlight検索", "help.mission": "ミッションコントロール", "help.lock": "画面をロック",
"help.newNote": "新しいメモ", "help.newTerm": "新しいターミナル", "help.wall": "次の壁紙",
"help.min": "最小化 / ズーム", "help.move": "ウィンドウ移動（タイトルバーにフォーカス）",
"help.resize": "ウィンドウのリサイズ", "help.menus": "メニュー操作", "help.tour": "ツアー / ダイアログ",
"help.note": "ヒント: メニューバーでは矢印キーでメニュー・項目間を移動、Enterで選択項目を実行できます。",
},
"hi": {
"app.tasks": "कार्य", "app.budget": "बजट",
"tk.add": "कार्य जोड़ें और Enter दबाएँ…", "tk.due": "समाप्ति", "tk.prio": "प्राथमिकता",
"tk.p0": "कम", "tk.p1": "सामान्य", "tk.p2": "उच्च",
"tk.fAll": "सभी", "tk.fToday": "आज", "tk.fOverdue": "पिछड़े", "tk.fDone": "पूर्ण",
"tk.empty": "यहाँ कुछ नहीं — ऊपर से कार्य जोड़ें।", "tk.open": "%d खुले", "tk.clearDone": "पूर्ण हटाएँ",
"bg.amount": "राशि", "bg.typeIn": "आय", "bg.typeOut": "खर्च", "bg.cat": "श्रेणी",
"bg.desc": "विवरण", "bg.date": "तारीख़", "bg.add": "जोड़ें",
"bg.income": "आय", "bg.expense": "खर्च", "bg.net": "इस महीने का शेष",
"bg.empty": "कोई लेन-देन नहीं — ऊपर से जोड़ें।",
"bg.cats": "खाना|यातायात|मकान|उपयोगिता|स्वास्थ्य|अन्य",
"bg.needAmt": "शून्य से बड़ी राशि दर्ज करें।",
"help.menu": "शॉर्टकट", "help.title": "कीबोर्ड शॉर्टकट",
"help.g1": "सिस्टम", "help.g2": "विंडो",
"help.spot": "Spotlight खोज", "help.mission": "मिशन कंट्रोल", "help.lock": "स्क्रीन लॉक",
"help.newNote": "नया नोट", "help.newTerm": "नया टर्मिनल", "help.wall": "अगला वॉलपेपर",
"help.min": "न्यूनतम / ज़ूम", "help.move": "विंडो हिलाएँ (टाइटल बार पर फोकस)",
"help.resize": "विंडो का आकार बदलें", "help.menus": "मेनू नेविगेट", "help.tour": "टूर / डायलॉग",
"help.note": "सुझाव: मेनू बार में तीर कुंजियाँ मेनू-वस्तुओं में चलाईं; Enter चयनित वस्तु चलाता है।",
},
"ar": {
"app.tasks": "المهام", "app.budget": "الميزانية",
"tk.add": "أضف مهمة واضغط Enter…", "tk.due": "تستحق", "tk.prio": "الأولوية",
"tk.p0": "منخفضة", "tk.p1": "عادية", "tk.p2": "عالية",
"tk.fAll": "الكل", "tk.fToday": "اليوم", "tk.fOverdue": "متأخرة", "tk.fDone": "منجزة",
"tk.empty": "لا شيء هنا — أضف مهمة بالأعلى.", "tk.open": "%d مفتوحة", "tk.clearDone": "مسح المنجزة",
"bg.amount": "المبلغ", "bg.typeIn": "دخل", "bg.typeOut": "مصروف", "bg.cat": "الفئة",
"bg.desc": "الوصف", "bg.date": "التاريخ", "bg.add": "إضافة",
"bg.income": "الدخل", "bg.expense": "المصروفات", "bg.net": "صافي هذا الشهر",
"bg.empty": "لا معاملات بعد — أضف واحدة بالأعلى.",
"bg.cats": "طعام|مواصلات|سكن|مرافق|صحة|أخرى",
"bg.needAmt": "أدخل مبلغاً أكبر من صفر.",
"help.menu": "الاختصارات", "help.title": "اختصارات لوحة المفاتيح",
"help.g1": "النظام", "help.g2": "النافذة",
"help.spot": "بحث Spotlight", "help.mission": "التحكم في المهام", "help.lock": "قفل الشاشة",
"help.newNote": "ملاحظة جديدة", "help.newTerm": "طرفية جديدة", "help.wall": "الخلفية التالية",
"help.min": "تصغير / تكبير", "help.move": "نقل النافذة (ركّز شريط العنوان)",
"help.resize": "تغيير حجم النافذة", "help.menus": "التنقل في القوائم", "help.tour": "الجولة / النوافذ",
"help.note": "ملاحظة: في شريط القائمة، الأسهم تنقل بين القوائم والعناصر؛ Enter يشغّل العنصر المحدد.",
},
}

def esc(v):
    return v.replace('\\', '\\\\').replace("'", "\\'")

lines = io.open('/home/user/webos/js/i18n.js', 'r', encoding='utf-8').read().split('\n')
cur = None
targets = {}
for i, ln in enumerate(lines):
    m = re.match(r"\s*([a-z]{2}): \{", ln)
    if m:
        cur = m.group(1)
        continue
    if cur and re.match(r"\s*'mu\.decErr':", ln):
        targets[cur] = i

assert set(targets.keys()) == set(LANGS), targets.keys()
for lang in sorted(targets, key=lambda L: -targets[L]):
    i = targets[lang]
    fw = lines[i].rstrip()
    assert fw.endswith("'"), (lang, fw)
    if not fw.endswith(','):
        lines[i] = fw + ','
    block = ["      '%s': '%s'" % (k, esc(T[lang][k])) for k in KEYS]
    for j in range(len(block) - 1):
        block[j] = block[j] + ','
    lines[i + 1:i + 1] = block

io.open('/home/user/webos/js/i18n.js', 'w', encoding='utf-8').write('\n'.join(lines))
print('i18n v2.6.0 inserted; keys per lang =', 182 + len(KEYS))
