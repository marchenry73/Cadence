// Localisation. English lives here as the base and the fallback; other
// languages are separate modules loaded on demand, so a user only ever
// downloads the language they chose.
export const LANGS = [
  { code: 'en', label: 'English',   native: 'English' },
  { code: 'es', label: 'Spanish',   native: 'Español' },
  { code: 'zh', label: 'Chinese',   native: '简体中文' },
  { code: 'hi', label: 'Hindi',     native: 'हिन्दी' },
  { code: 'ar', label: 'Arabic',    native: 'العربية' },
  { code: 'pt', label: 'Portuguese',native: 'Português' },
  { code: 'fr', label: 'French',    native: 'Français' },
  { code: 'de', label: 'German',    native: 'Deutsch' },
  { code: 'ru', label: 'Russian',   native: 'Русский' },
  { code: 'ja', label: 'Japanese',  native: '日本語' }
];

const RTL = new Set(['ar']);

export const EN = {
  'nav.today': 'Today', 'nav.calendar': 'Calendar', 'nav.tasks': 'Tasks',
  'nav.goals': 'Goals', 'nav.team': 'Team', 'nav.settings': 'Settings',
  'nav.review': 'Review',

  'app.today': 'Today', 'app.tomorrow': 'Tomorrow', 'app.now': 'Now',
  'app.offline': 'Offline', 'app.syncing': 'Syncing', 'app.synced': 'Synced',
  'app.pending': '{n} waiting to sync', 'app.loading': 'Loading',
  'app.dropped': '{n} not saved', 'app.syncError': 'Sync failed',
  'app.droppedTitle': 'Changes that could not be saved',
  'app.droppedBody': 'The server refused these, so they were not kept. Nothing here is recoverable — if you still want them, make the change again.',
  'app.droppedAck': 'Dismiss',

  'common.add': 'Add', 'common.save': 'Save', 'common.cancel': 'Cancel',
  'common.delete': 'Delete', 'common.close': 'Close', 'common.done': 'Done',
  'common.edit': 'Edit', 'common.new': 'New', 'common.search': 'Search',
  'common.retry': 'Retry', 'common.yes': 'Yes', 'common.no': 'No',
  'common.none': 'None', 'common.all': 'All', 'common.back': 'Back',
  'common.optional': 'optional', 'common.minutes': 'min', 'common.hours': 'h',

  'today.committed': 'Committed', 'today.open': 'Open', 'today.nextUp': 'Next up',
  'today.nothingLeft': 'Nothing left scheduled today',
  'today.startFocus': 'Start focus', 'today.push': '+15m',
  'today.blocks': '{n} blocks', 'today.yourDay': 'Your day',
  'today.freeTime': 'Free time', 'today.suggest': 'Fill this gap',
  'today.empty': 'A clear day. Add a block or pull a task in.',
  'today.in': 'in {t}', 'today.nowRunning': 'Running now',
  'today.planDay': 'Plan this day',
  'today.streak': 'Day streak', 'today.todayLower': 'today',
  // Deliberately names the three things that count, because opening the
  // app is not one of them and a stuck 0 otherwise looks like a bug.
  'today.streakHow': 'Confirm a block, finish a task or a focus session',

  'block.new': 'New block', 'block.edit': 'Edit block', 'block.title': 'Title',
  'block.category': 'Category', 'block.start': 'Starts', 'block.end': 'Ends',
  'block.notes': 'Notes', 'block.image': 'Image', 'block.addImage': 'Add image',
  'block.removeImage': 'Remove image', 'block.skipOnce': 'Skip just today',
  'block.overlap': 'Overlaps {title}', 'block.routine': 'Routine',
  'block.editOnce': 'Editing today only', 'block.uploading': 'Uploading',

  'task.new': 'New task', 'task.edit': 'Edit task', 'task.title': 'Title',
  'task.due': 'Due', 'task.importance': 'Importance', 'task.urgency': 'Urgency',
  'task.estimate': 'Estimate', 'task.open': 'Open', 'task.done': 'Done',
  'task.overdue': 'Overdue', 'task.empty': 'No tasks here yet',
  'task.schedule': 'Put on the calendar', 'task.swipeHint': 'Swipe a task to complete it',

  'goal.new': 'New goal', 'goal.edit': 'Edit goal', 'goal.title': 'Title',
  'goal.area': 'Area', 'goal.horizon': 'Horizon', 'goal.target': 'Target date',
  'goal.why': 'Why it matters', 'goal.progress': 'Progress',
  'goal.milestones': 'Milestones', 'goal.addMilestone': 'Add milestone',
  'goal.checkins': 'Check-ins', 'goal.addCheckin': 'Add check-in',
  'goal.empty': 'No goals yet', 'goal.stale': 'No check-in in two weeks',
  'goal.nextStep': 'Next step', 'goal.toTask': 'Make it a task',

  'cal.week': 'Week', 'cal.month': 'Month', 'cal.agenda': 'Agenda',
  'cal.today': 'Today', 'cal.empty': 'Nothing scheduled',
  'cal.prevWeek': 'Previous week', 'cal.nextWeek': 'Next week',
  'today.markDone': 'Mark done', 'today.markNotDone': 'Mark not done',
  'task.markDone': 'Mark done', 'task.markNotDone': 'Mark not done',
  'block.repeats': 'Repeats', 'block.repeatsHint': 'Pick days to make this a routine',
  'cal.prevMonth': 'Previous month', 'cal.nextMonth': 'Next month',
  'cal.weekShape': 'Where this week goes',
  'cal.emptyWeek': 'Nothing scheduled this week yet — add a block or a routine and it will show up here.',

  'team.title': 'Team', 'team.create': 'Create a workspace',
  'team.join': 'Join with a code', 'team.code': 'Join code',
  'team.members': 'Members', 'team.role': 'Role', 'team.leave': 'Leave workspace',
  'team.none': 'You are working solo. Create a workspace to plan with others.',
  'team.remove': 'Remove from workspace', 'team.busy': 'Busy until {t}',
  'team.free': 'Free', 'team.owner': 'Owner', 'team.admin': 'Admin',
  'team.member': 'Member', 'team.viewer': 'Viewer',
  'team.personalStays': 'Your personal data stays private. Only workspace members see each other\u2019s schedule.',

  'set.appearance': 'Appearance', 'set.theme': 'Theme', 'set.dark': 'Dark',
  'set.light': 'Light', 'set.system': 'System', 'set.accent': 'Accent', 'set.density': 'Density',
  'set.comfortable': 'Comfortable', 'set.compact': 'Compact',
  'set.language': 'Language', 'set.clock24': '24-hour clock',
  'set.weekStart': 'Week starts', 'set.focusWindow': 'Focus hours',
  'set.focusHint': 'The calendar always shows the full 24 hours. These hours are just highlighted.',
  'set.haptics': 'Vibration', 'set.reminders': 'Reminders',
  'set.categories': 'Categories', 'set.addCategory': 'Add category',
  'set.account': 'Account', 'set.workspace': 'Workspace',
  'set.support': 'Support', 'set.data': 'Your data', 'set.export': 'Export everything',
  'set.storage': 'Image storage', 'set.signOut': 'Sign out',
  'set.deleteAccount': 'Delete my account and data',
  'set.deleteWarn': 'This erases your account, every block, task, goal and image. It cannot be undone.',
  'set.deleteConfirm': 'Type DELETE to confirm',
  'set.version': 'Version', 'set.sync': 'Sync',

  'sup.title': 'Support', 'sup.kind': 'What is this about?',
  'sup.support': 'I need help', 'sup.feedback': 'An idea', 'sup.bug': 'Something is broken',
  'sup.subject': 'Subject', 'sup.body': 'Details', 'sup.send': 'Send',
  'sup.sent': 'Sent. We read every one of these.',
  'sup.diag': 'A bug report attaches your app version, device and recent errors.',
  'sup.history': 'Your messages',

  'auth.signIn': 'Sign in', 'auth.signUp': 'Create account',
  'auth.email': 'Email or username', 'auth.emailOnly': 'Email',
  'auth.password': 'Password', 'auth.username': 'Username',
  'auth.name': 'Your name', 'auth.forgot': 'Forgot password',
  'auth.reset': 'Send reset link', 'auth.haveAccount': 'I already have an account',
  'auth.noAccount': 'Create an account', 'auth.tagline': 'Plan your day, see your week.',
  'auth.checking': 'Checking', 'auth.taken': 'Taken', 'auth.free': 'Available',
  'auth.continueGuest': 'Continue as guest',

  'sug.when': 'When should I do this?', 'sug.find': 'Find me a time',
  'sug.none': 'No open slot big enough in the next week — try a shorter estimate.',
  'sug.scheduled': 'Scheduled {d} at {t}',

  'gsync.paused': 'Google Calendar sync paused',
  'gsync.pausedWhy': 'Google signs you out of calendar access after about an hour. Your changes are saved and will sync as soon as you reconnect.',
  'gsync.reconnect': 'Reconnect Google',
  'gsync.needsConsent': 'Cadence needs permission to use your Google Calendar.',
  'gsync.willPause': 'Google Calendar sync will stop in about an hour',
  'gsync.needsRefresh': 'Google only hands over the key that keeps sync running when you reconnect. Syncing works until then.',
  'gsync.apiDisabled': 'Turn on the Google Calendar API in Google Cloud to sync.',

  'app.guest': 'Guest — not saved',
  'guest.blocked': 'Create an account for this',
  'guest.bannerTitle': "You're browsing as a guest",
  'guest.bannerBody': 'Nothing you do in this session is saved anywhere — not on this device, not in the cloud. Close the tab and it’s gone. Create an account any time to keep it.',
  'guest.exit': 'Exit guest mode',

  'timer.focus': 'Focus', 'timer.start': 'Start', 'timer.pause': 'Pause',
  'timer.reset': 'Reset', 'timer.finished': 'Focus finished',
  'timer.resume': 'Resume', 'timer.paused': 'Paused — hold to reset',
  'timer.resumed': 'Back on',

  'msg.saved': 'Saved', 'msg.deleted': 'Deleted', 'msg.copied': 'Copied', 'common.copy': 'Copy', 'common.you': 'you',
  'msg.queued': 'Saved on this device. It will sync when you are back online.',
  'msg.imageTooBig': 'That image is over 5 MB',
  'msg.badImage': 'Only JPEG, PNG, WebP or HEIC images',
  'msg.confirmDelete': 'Delete this?', 'msg.somethingWrong': 'Something went wrong',
  'msg.confirmDeleteSeries': 'Delete this and every other time it repeats?',
  'board.failed': 'Could not load the board just now.',

  // The Review screen. It had four t() calls against two dozen strings, so
  // it stayed English whatever language the rest of the app was in.
  'rev.pointsWeek': 'Points this week', 'rev.level': 'Level', 'rev.levelN': 'Level {n}',
  'rev.challengeDone': 'Challenge complete — nice.', 'rev.challengeThis': 'This month\u2019s challenge',
  'rev.earned': 'Earned',
  'rev.reviewDone': 'Review done for this week ✓', 'rev.finishReview': 'Finish this week\u2019s review (+30)',
  'rev.board': 'This week\u2019s board', 'rev.boardLoading': 'Loading the board…',
  'rev.boardNickname': 'Pick a nickname to join the weekly board — it is the only thing other people see.',
  'rev.chooseNickname': 'Choose a nickname',
  'rev.boardEmpty': 'No scores posted yet this week — be first.',
  'rev.boardReset': 'Points reset every week, so a good week always counts.',
  'rev.selfVsIdeal': 'Current self vs ideal self', 'rev.yourRun': 'Your run',
  'rev.planned': 'Planned', 'rev.actuallyDone': 'Actually done', 'rev.planKept': 'Plan kept',
  // Reads correctly at any number, because t() has no plural support.
  'rev.unconfirmed': '{n} not confirmed yet — tick them off on Today so this stays honest.',
  'rev.timeWent': 'Where the time went', 'rev.uncategorised': 'Uncategorised',
  // Whole sentences with slots, not fragments: word order is not universal.
  'rev.insightOver': 'You planned {t} more {cat} than you kept. Try scheduling less of it next week.',
  'rev.insightBest': '{cat} is your most reliable block — protect it.',
  'rev.timeWord': 'time', 'rev.thatCategory': 'That category',
  'rev.emptyWeek': 'Nothing scheduled this week yet.',
  'rev.emptyWeekSub': 'Plan a few blocks, then confirm them as the week goes.',
  'rev.hoursPerGoal': 'Hours invested per goal',
  'rev.goalHoursHint': 'Link a block to a goal when you create it, and its hours land here.',

  // The efficiency model in ideal.js, which renders inside Review.
  'eff.goalTime': 'Time on goals', 'eff.shape': 'Matched your ideal day',
  'eff.deep': 'Uninterrupted focus', 'eff.ontime': 'Confirmed on the day',
  'eff.accounted': 'Hours accounted for', 'eff.area': 'Area',
  // One complete sentence per branch. Handing a translator "Solid week."
  // and " The one to reclaim next week is" separately cannot produce a
  // correct sentence in a language that orders them differently.
  'eff.coachNone': 'Nothing scheduled yet — put one block in for tomorrow and you are already moving.',
  'eff.coachGreat': 'Outstanding week. You are living close to the person you described.',
  'eff.coachGreatWin': 'Outstanding week. You are living close to the person you described — {cat} especially.',
  'eff.coachSolid': 'Solid week. Keep the rhythm going.',
  'eff.coachSolidGap': 'Solid week. The one to reclaim next week is {cat} — you are at {pct}% of the hours you wanted.',
  'eff.coachProgress': 'Real progress, uneven days. Confirm your blocks as you go and this gets easier to read.',
  'eff.coachProgressGap': 'Real progress, uneven days. Protect two {cat} blocks next week and this jumps.',
  'eff.coachRough': 'Rough week — everyone has them. Pick one block for tomorrow and confirm it; that is the whole trick.',
};

let current = 'en';
const dicts = { en: EN };

export function currentLang() { return current; }

export async function setLang(code) {
  const known = LANGS.some(l => l.code === code) ? code : 'en';
  if (!dicts[known]) {
    try { dicts[known] = (await import(`./lang/${known}.js`)).default; }
    catch (e) { console.warn('Language pack failed, staying on English', e); return current; }
  }
  current = known;
  document.documentElement.lang = known;
  document.documentElement.dir = RTL.has(known) ? 'rtl' : 'ltr';
  return current;
}

export function t(key, vars) {
  let s = dicts[current]?.[key] ?? EN[key] ?? key;
  if (vars) for (const k in vars) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
  return s;
}

// Locale-aware day and month names, so the calendar reads natively without
// shipping a name table per language.
export function dayNames(short = true, weekStarts = 0) {
  const fmt = new Intl.DateTimeFormat(current, { weekday: short ? 'short' : 'long' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 8, 1 + ((i + weekStarts) % 7)); // 2024-09-01 was a Sunday
    return fmt.format(d);
  });
}

export function monthLabel(dayISO) {
  const [y, m, d] = dayISO.split('-').map(Number);
  return new Intl.DateTimeFormat(current, { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, d));
}

// Month and year as separate strings so the header can set them at one
// size in two weights ("September" bold, "2026" regular and dimmed). The
// weight split is the one typographic move every well-set calendar shares;
// it reads as a title rather than a date stamp.
export function monthParts(dayISO) {
  const [y, m, d] = dayISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    month: new Intl.DateTimeFormat(current, { month: 'long' }).format(dt),
    year: new Intl.DateTimeFormat(current, { year: 'numeric' }).format(dt)
  };
}
export function dateLabel(dayISO, opts = { weekday: 'long', month: 'short', day: 'numeric' }) {
  const [y, m, d] = dayISO.split('-').map(Number);
  return new Intl.DateTimeFormat(current, opts).format(new Date(y, m - 1, d));
}
