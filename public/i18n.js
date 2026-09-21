(function () {
    var STORAGE_KEY = 'rabt_lang';
    var RTL = { ar: true, fa: true, ps: true };
    var LANGS = [
        { id: 'en', name: 'English', native: 'English', dir: 'ltr' },
        { id: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
        { id: 'fa', name: 'Persian', native: 'فارسی', dir: 'rtl' },
        { id: 'ps', name: 'Pashto', native: 'پښتو', dir: 'rtl' }
    ];

    var STRINGS = {
        en: {
            'nav.overview': 'Overview',
            'nav.channels': 'Channels',
            'nav.workspace': 'Workspace',
            'nav.help': 'Help & Support',
            'nav.guide': 'Full platform guide',
            'nav.guideHint': 'Full platform guide',
            'nav.guideFull': 'Full guide',
            'nav.privacy': 'Privacy',
            'nav.language': 'Language',
            'nav.invite': 'Invite Friends',
            'nav.kpi': 'KPI Overview',
            'nav.email': 'Email',
            'nav.whatsapp': 'WhatsApp',
            'nav.telegram': 'Telegram',
            'nav.schedule': 'Schedule',
            'nav.import': 'Contact',
            'nav.verifiedContact': 'Verified Contact',
            'nav.marketingDatabase': 'Marketing Database',
            'nav.templates': 'Templates',
            'nav.settings': 'Settings',
            'settings.account': 'Account',
            'nav.downloadAndroid': 'Download Android App',
            'nav.downloadAndroidHint': 'Get the Rabط APK',
            'nav.assistance': 'Get assistance',
            'nav.privacyPolicy': 'Privacy Policy',
            'nav.privacyHint': 'Read the full privacy policy',
            'nav.terms': 'Terms of Service',
            'nav.termsHint': 'Read the full terms of service',
            'nav.chooseLanguage': 'Choose app language',
            'nav.chooseLanguageHint': 'Change the language of Rabط',
            'nav.shareInvite': 'Share your personal invite link',
            'nav.shareInviteHint': 'Invite friends to Rabط',
            'nav.signIn': 'Sign in',
            'nav.signUp': 'Sign up',
            'nav.signOut': 'Sign out',
            'nav.tagline': 'One platform',
            'nav.guestHint': 'Sign in to use Email, WhatsApp, and Telegram in one workspace.',
            'nav.closeMenu': 'Close menu',
            'nav.openMenu': 'Open menu',
            'nav.back': 'Back',
            'nav.toggleTheme': 'Toggle theme',
            'nav.connected': 'Connected',
            'nav.disconnected': 'Disconnected',
            'page.login': 'Sign in',
            'page.signup': 'Sign up',
            'page.privacy': 'Privacy Policy',
            'page.terms': 'Terms of Service',
            'page.language': 'Language',
            'page.invite': 'Invite Friends',
            'page.support': 'Get assistance',
            'page.guide': 'Full platform guide',
            'guide.lead': 'A full walkthrough of Rabط: how to sign in, connect channels, import contacts, send campaigns, schedule jobs, and read your results.',
            'page.verify': 'Verify email',
            'login.title': 'Sign in',
            'login.hint': 'Sign in to the Rabط workspace — Email, WhatsApp, Telegram, and scheduling in one place.',
            'login.email': 'Email',
            'login.password': 'Password',
            'login.submit': 'Sign in',
            'login.noAccount': 'No account yet?',
            'login.backHome': 'Back to Home',
            'login.needCode': 'Need a new code?',
            'login.resend': 'Resend code',
            'login.enterCode': 'enter it here',
            'login.or': 'or',
            'login.forgot': 'Forgot password?',
            'common.and': 'and',
            'signup.title': 'Sign up',
            'signup.hint': 'Create an account with your email. We will send a 6-digit code, then you can sign in to your own workspace.',
            'signup.name': 'Full name',
            'signup.password': 'Password',
            'signup.submit': 'Create account',
            'signup.agreePrefix': 'By creating an account you agree to the',
            'signup.hasAccount': 'Already have an account?',
            'verify.title': 'Enter code',
            'verify.hint': 'We emailed a 6-digit code to your address. Enter it here to verify your account. The code expires in 10 minutes.',
            'verify.code': 'Verification code',
            'verify.submit': 'Verify account',
            'verify.noCode': "Didn't get the code?",
            'verify.verified': 'Already verified?',
            'verify.back': 'Back to sign in',
            'page.forgot': 'Forgot password',
            'forgot.title': 'Forgot password',
            'forgot.hint': 'Enter your account email. We will send a 6-digit code to reset your password.',
            'forgot.sendCode': 'Send reset code',
            'forgot.resetTitle': 'Set new password',
            'forgot.resetHint': 'Enter the 6-digit code from your email and choose a new password.',
            'forgot.code': 'Reset code',
            'forgot.newPassword': 'New password',
            'forgot.confirmPassword': 'Confirm password',
            'forgot.submit': 'Update password',
            'forgot.back': 'Back to sign in',
            'forgot.remember': 'Remember your password?',
            'lang.title': 'Choose app language',
            'lang.lead': 'Pick the language for menus, buttons, and every page in the workspace. Your choice is saved on this device.',
            'lang.using': 'Currently using',
            'invite.title': 'Invite Friends',
            'invite.lead': 'Share your personal invite link. Friends who open it can create their own Rabط account.',
            'invite.copy': 'Copy link',
            'invite.copied': 'Link copied',
            'invite.share': 'Share',
            'invite.how': 'How it works',
            'invite.step1': 'Copy or share your personal link.',
            'invite.step2': 'Your friend opens the link and signs up.',
            'invite.step3': 'They get their own workspace after verifying email.',
            'invite.friends': 'Friends who joined',
            'invite.empty': 'No one has used your link yet. Share it to invite friends.',
            'invite.count': 'joined with your link',
            'signup.invitedBanner': 'A friend invited you to Rabط. Create your account to join.',
            'support.title': 'Open support chat',
            'support.lead': 'Message the Rabط platform team. Super admin will reply here.',
            'support.placeholder': 'Write your message…',
            'support.send': 'Send',
            'support.empty': 'Start a conversation with the platform team. Ask about your account, channels, or anything on Rabط.',
            'support.you': 'You',
            'support.team': 'Rabط Support',
            'legal.privacyLead': 'Read the full privacy policy. This page explains what information the Rabط platform collects, how it is used, how it is stored, and the choices you have.',
            'legal.termsLead': 'Read the full terms of service. These terms are the agreement between you and the operator of this Rabط platform for your use of the website, workspace, and related features.'
        },
        ar: {
            'nav.overview': 'نظرة عامة',
            'nav.channels': 'القنوات',
            'nav.workspace': 'مساحة العمل',
            'nav.help': 'المساعدة والدعم',
            'nav.guide': 'دليل المنصة الكامل',
            'nav.guideHint': 'دليل المنصة الكامل',
            'nav.guideFull': 'الدليل الكامل',
            'nav.privacy': 'الخصوصية',
            'nav.language': 'اللغة',
            'nav.invite': 'دعوة الأصدقاء',
            'nav.kpi': 'مؤشرات الأداء',
            'nav.email': 'البريد',
            'nav.whatsapp': 'واتساب',
            'nav.telegram': 'تيليجرام',
            'nav.schedule': 'الجدولة',
            'nav.import': 'جهات الاتصال',
            'nav.verifiedContact': 'جهات الاتصال الموثقة',
            'nav.marketingDatabase': 'قاعدة بيانات التسويق',
            'nav.templates': 'القوالب',
            'nav.settings': 'الإعدادات',
            'settings.account': 'الحساب',
            'nav.downloadAndroid': 'تنزيل تطبيق أندرويد',
            'nav.downloadAndroidHint': 'حمّل ملف APK لربط',
            'nav.assistance': 'طلب المساعدة',
            'nav.privacyPolicy': 'سياسة الخصوصية',
            'nav.privacyHint': 'اقرأ سياسة الخصوصية كاملة',
            'nav.terms': 'شروط الخدمة',
            'nav.termsHint': 'اقرأ شروط الخدمة كاملة',
            'nav.chooseLanguage': 'اختيار لغة التطبيق',
            'nav.chooseLanguageHint': 'غيّر لغة واجهة ربط',
            'nav.shareInvite': 'شارك رابط دعوتك الشخصي',
            'nav.shareInviteHint': 'ادعُ أصدقاءك إلى ربط',
            'nav.signIn': 'تسجيل الدخول',
            'nav.signUp': 'إنشاء حساب',
            'nav.signOut': 'تسجيل الخروج',
            'nav.tagline': 'منصة واحدة',
            'nav.guestHint': 'سجّل الدخول لاستخدام البريد وواتساب وتيليجرام في مساحة واحدة.',
            'nav.closeMenu': 'إغلاق القائمة',
            'nav.openMenu': 'فتح القائمة',
            'nav.back': 'رجوع',
            'nav.toggleTheme': 'تبديل المظهر',
            'nav.connected': 'متصل',
            'nav.disconnected': 'غير متصل',
            'page.login': 'تسجيل الدخول',
            'page.signup': 'إنشاء حساب',
            'page.privacy': 'سياسة الخصوصية',
            'page.terms': 'شروط الخدمة',
            'page.language': 'اللغة',
            'page.invite': 'دعوة الأصدقاء',
            'page.support': 'طلب المساعدة',
            'page.guide': 'دليل المنصة الكامل',
            'guide.lead': 'شرح كامل لربط: تسجيل الدخول، ربط القنوات، استيراد جهات الاتصال، إرسال الحملات، الجدولة، وقراءة النتائج.',
            'page.verify': 'تأكيد البريد',
            'login.title': 'تسجيل الدخول',
            'login.hint': 'ادخل إلى مساحة ربط — البريد وواتساب وتيليجرام والجدولة في مكان واحد.',
            'login.email': 'البريد الإلكتروني',
            'login.password': 'كلمة المرور',
            'login.submit': 'تسجيل الدخول',
            'login.noAccount': 'ليس لديك حساب؟',
            'login.backHome': 'العودة إلى الرئيسية',
            'login.needCode': 'تحتاج رمزاً جديداً؟',
            'login.resend': 'إعادة إرسال الرمز',
            'login.enterCode': 'أدخله هنا',
            'login.or': 'أو',
            'login.forgot': 'نسيت كلمة المرور؟',
            'common.and': 'و',
            'signup.title': 'إنشاء حساب',
            'signup.hint': 'أنشئ حساباً ببريدك. سنرسل رمزاً من 6 أرقام ثم يمكنك الدخول إلى مساحتك.',
            'signup.name': 'الاسم الكامل',
            'signup.password': 'كلمة المرور',
            'signup.submit': 'إنشاء الحساب',
            'signup.agreePrefix': 'بإنشاء الحساب أنت توافق على',
            'signup.hasAccount': 'لديك حساب بالفعل؟',
            'verify.title': 'أدخل الرمز',
            'verify.hint': 'أرسلنا رمزاً من 6 أرقام إلى بريدك. أدخله هنا لتأكيد الحساب. ينتهي خلال 10 دقائق.',
            'verify.code': 'رمز التحقق',
            'verify.submit': 'تأكيد الحساب',
            'verify.noCode': 'لم يصلك الرمز؟',
            'verify.verified': 'تم التأكيد مسبقاً؟',
            'verify.back': 'العودة لتسجيل الدخول',
            'page.forgot': 'نسيت كلمة المرور',
            'forgot.title': 'نسيت كلمة المرور',
            'forgot.hint': 'أدخل بريد حسابك. سنرسل رمزاً من 6 أرقام لإعادة تعيين كلمة المرور.',
            'forgot.sendCode': 'إرسال رمز إعادة التعيين',
            'forgot.resetTitle': 'تعيين كلمة مرور جديدة',
            'forgot.resetHint': 'أدخل الرمز من 6 أرقام من بريدك واختر كلمة مرور جديدة.',
            'forgot.code': 'رمز إعادة التعيين',
            'forgot.newPassword': 'كلمة المرور الجديدة',
            'forgot.confirmPassword': 'تأكيد كلمة المرور',
            'forgot.submit': 'تحديث كلمة المرور',
            'forgot.back': 'العودة لتسجيل الدخول',
            'forgot.remember': 'تذكرت كلمة المرور؟',
            'lang.title': 'اختيار لغة التطبيق',
            'lang.lead': 'اختر لغة القوائم والأزرار وكل صفحات مساحة العمل. يُحفظ اختيارك على هذا الجهاز.',
            'lang.using': 'اللغة الحالية',
            'invite.title': 'دعوة الأصدقاء',
            'invite.lead': 'شارك رابط دعوتك الشخصي. يمكن للأصدقاء فتحه وإنشاء حسابهم على ربط.',
            'invite.copy': 'نسخ الرابط',
            'invite.copied': 'تم نسخ الرابط',
            'invite.share': 'مشاركة',
            'invite.how': 'كيف يعمل',
            'invite.step1': 'انسخ رابطك أو شاركه.',
            'invite.step2': 'يفتح صديقك الرابط ويسجّل حساباً.',
            'invite.step3': 'يحصل على مساحة عمله بعد تأكيد البريد.',
            'invite.friends': 'الأصدقاء الذين انضموا',
            'invite.empty': 'لم يستخدم أحد رابطك بعد. شاركه لدعوة الأصدقاء.',
            'invite.count': 'انضموا عبر رابطك',
            'signup.invitedBanner': 'دعاك صديق إلى ربط. أنشئ حسابك للانضمام.',
            'support.title': 'فتح محادثة الدعم',
            'support.lead': 'راسل فريق منصة ربط. سيرد المشرف من هنا.',
            'support.placeholder': 'اكتب رسالتك…',
            'support.send': 'إرسال',
            'support.empty': 'ابدأ محادثة مع فريق المنصة. اسأل عن حسابك أو القنوات أو أي شيء في ربط.',
            'support.you': 'أنت',
            'support.team': 'دعم ربط',
            'legal.privacyLead': 'اقرأ سياسة الخصوصية كاملة. توضح هذه الصفحة البيانات التي تجمعها منصة ربط وكيفية استخدامها وتخزينها وخياراتك.',
            'legal.termsLead': 'اقرأ شروط الخدمة كاملة. هذه الشروط هي الاتفاق بينك وبين مشغّل منصة ربط لاستخدام الموقع ومساحة العمل.'
        },
        fa: {
            'nav.overview': 'نمای کلی',
            'nav.channels': 'کانال‌ها',
            'nav.workspace': 'فضای کاری',
            'nav.help': 'راهنمایی و پشتیبانی',
            'nav.guide': 'راهنمای کامل پلتفرم',
            'nav.guideHint': 'راهنمای کامل پلتفرم',
            'nav.guideFull': 'راهنمای کامل',
            'nav.privacy': 'حریم خصوصی',
            'nav.language': 'زبان',
            'nav.invite': 'دعوت دوستان',
            'nav.kpi': 'شاخص‌های عملکرد',
            'nav.email': 'ایمیل',
            'nav.whatsapp': 'واتساپ',
            'nav.telegram': 'تلگرام',
            'nav.schedule': 'زمان‌بندی',
            'nav.import': 'مخاطبین',
            'nav.verifiedContact': 'مخاطب تأییدشده',
            'nav.marketingDatabase': 'پایگاه داده بازاریابی',
            'nav.templates': 'قالب‌ها',
            'nav.settings': 'تنظیمات',
            'settings.account': 'حساب',
            'nav.downloadAndroid': 'دانلود اپلیکیشن اندروید',
            'nav.downloadAndroidHint': 'فایل APK ربط را بگیرید',
            'nav.assistance': 'درخواست کمک',
            'nav.privacyPolicy': 'سیاست حفظ حریم خصوصی',
            'nav.privacyHint': 'متن کامل سیاست حریم خصوصی را بخوانید',
            'nav.terms': 'شرایط استفاده',
            'nav.termsHint': 'متن کامل شرایط استفاده را بخوانید',
            'nav.chooseLanguage': 'انتخاب زبان برنامه',
            'nav.chooseLanguageHint': 'زبان رابط ربط را تغییر دهید',
            'nav.shareInvite': 'لینک دعوت شخصی خود را به اشتراک بگذارید',
            'nav.shareInviteHint': 'دوستان را به ربط دعوت کنید',
            'nav.signIn': 'ورود',
            'nav.signUp': 'ثبت‌نام',
            'nav.signOut': 'خروج',
            'nav.tagline': 'یک پلتفرم',
            'nav.guestHint': 'وارد شوید تا ایمیل، واتساپ و تلگرام را در یک فضای کاری استفاده کنید.',
            'nav.closeMenu': 'بستن منو',
            'nav.openMenu': 'باز کردن منو',
            'nav.back': 'بازگشت',
            'nav.toggleTheme': 'تغییر ظاهر',
            'nav.connected': 'متصل',
            'nav.disconnected': 'قطع',
            'page.login': 'ورود',
            'page.signup': 'ثبت‌نام',
            'page.privacy': 'سیاست حفظ حریم خصوصی',
            'page.terms': 'شرایط استفاده',
            'page.language': 'زبان',
            'page.invite': 'دعوت دوستان',
            'page.support': 'درخواست کمک',
            'page.guide': 'راهنمای کامل پلتفرم',
            'guide.lead': 'راهنمای کامل ربط: ورود، اتصال کانال‌ها، وارد کردن مخاطبین، ارسال کمپین، زمان‌بندی و خواندن نتایج.',
            'page.verify': 'تأیید ایمیل',
            'login.title': 'ورود',
            'login.hint': 'وارد فضای کاری ربط شوید — ایمیل، واتساپ، تلگرام و زمان‌بندی در یک جا.',
            'login.email': 'ایمیل',
            'login.password': 'رمز عبور',
            'login.submit': 'ورود',
            'login.noAccount': 'حساب ندارید؟',
            'login.backHome': 'بازگشت به خانه',
            'login.needCode': 'کد جدید می‌خواهید؟',
            'login.resend': 'ارسال دوباره کد',
            'login.enterCode': 'اینجا وارد کنید',
            'login.or': 'یا',
            'login.forgot': 'رمز عبور را فراموش کردید؟',
            'common.and': 'و',
            'signup.title': 'ثبت‌نام',
            'signup.hint': 'با ایمیل حساب بسازید. یک کد ۶ رقمی می‌فرستیم؛ بعد می‌توانید وارد فضای خود شوید.',
            'signup.name': 'نام کامل',
            'signup.password': 'رمز عبور',
            'signup.submit': 'ایجاد حساب',
            'signup.agreePrefix': 'با ساخت حساب موافقت می‌کنید با',
            'signup.hasAccount': 'قبلاً حساب دارید؟',
            'verify.title': 'کد را وارد کنید',
            'verify.hint': 'یک کد ۶ رقمی به ایمیل شما فرستادیم. برای تأیید حساب اینجا وارد کنید. اعتبار کد ۱۰ دقیقه است.',
            'verify.code': 'کد تأیید',
            'verify.submit': 'تأیید حساب',
            'verify.noCode': 'کد نرسید؟',
            'verify.verified': 'قبلاً تأیید شده؟',
            'verify.back': 'بازگشت به ورود',
            'page.forgot': 'فراموشی رمز عبور',
            'forgot.title': 'فراموشی رمز عبور',
            'forgot.hint': 'ایمیل حساب خود را وارد کنید. یک کد ۶ رقمی برای بازنشانی رمز می‌فرستیم.',
            'forgot.sendCode': 'ارسال کد بازنشانی',
            'forgot.resetTitle': 'رمز جدید',
            'forgot.resetHint': 'کد ۶ رقمی ایمیل را وارد کنید و رمز جدید انتخاب کنید.',
            'forgot.code': 'کد بازنشانی',
            'forgot.newPassword': 'رمز جدید',
            'forgot.confirmPassword': 'تأیید رمز',
            'forgot.submit': 'به‌روزرسانی رمز',
            'forgot.back': 'بازگشت به ورود',
            'forgot.remember': 'رمز را به خاطر دارید؟',
            'lang.title': 'انتخاب زبان برنامه',
            'lang.lead': 'زبان منوها، دکمه‌ها و همه صفحات فضای کاری را انتخاب کنید. انتخاب روی همین دستگاه ذخیره می‌شود.',
            'lang.using': 'در حال استفاده',
            'invite.title': 'دعوت دوستان',
            'invite.lead': 'لینک دعوت شخصی خود را بفرستید. دوستان با باز کردن آن حساب ربط می‌سازند.',
            'invite.copy': 'کپی لینک',
            'invite.copied': 'لینک کپی شد',
            'invite.share': 'اشتراک‌گذاری',
            'invite.how': 'چطور کار می‌کند',
            'invite.step1': 'لینک را کپی یا اشتراک کنید.',
            'invite.step2': 'دوست شما لینک را باز می‌کند و ثبت‌نام می‌کند.',
            'invite.step3': 'پس از تأیید ایمیل، فضای کاری خودش را می‌گیرد.',
            'invite.friends': 'دوستانی که پیوستند',
            'invite.empty': 'هنوز کسی از لینک شما استفاده نکرده. آن را به اشتراک بگذارید.',
            'invite.count': 'با لینک شما پیوستند',
            'signup.invitedBanner': 'یک دوست شما را به ربط دعوت کرده. حساب بسازید تا بپیوندید.',
            'support.title': 'باز کردن گفتگوی پشتیبانی',
            'support.lead': 'برای تیم پلتفرم ربط پیام بفرستید. مدیر از اینجا پاسخ می‌دهد.',
            'support.placeholder': 'پیام خود را بنویسید…',
            'support.send': 'ارسال',
            'support.empty': 'گفتگو با تیم پلتفرم را شروع کنید. درباره حساب، کانال‌ها یا هر موضوع ربط بپرسید.',
            'support.you': 'شما',
            'support.team': 'پشتیبانی ربط',
            'legal.privacyLead': 'متن کامل سیاست حریم خصوصی را بخوانید. این صفحه توضیح می‌دهد ربط چه داده‌هایی جمع می‌کند، چگونه استفاده و ذخیره می‌شود و چه انتخاب‌هایی دارید.',
            'legal.termsLead': 'متن کامل شرایط استفاده را بخوانید. این شرایط توافق شما با گرداننده پلتفرم ربط برای استفاده از وب‌سایت و فضای کاری است.'
        },
        ps: {
            'nav.overview': 'لنډیز',
            'nav.channels': 'چینلونه',
            'nav.workspace': 'کاري ځای',
            'nav.help': 'مرسته او ملاتړ',
            'nav.guide': 'د پلیټفارم بشپړ لارښود',
            'nav.guideHint': 'د پلیټفارم بشپړ لارښود',
            'nav.guideFull': 'بشپړ لارښود',
            'nav.privacy': 'محرمیت',
            'nav.language': 'ژبه',
            'nav.invite': 'ملګري راوبلئ',
            'nav.kpi': 'KPI کتنه',
            'nav.email': 'بریښنالیک',
            'nav.whatsapp': 'واټساپ',
            'nav.telegram': 'ټلیګرام',
            'nav.schedule': 'مهالویش',
            'nav.import': 'اړیکې',
            'nav.verifiedContact': 'تایید شوي اړیکې',
            'nav.marketingDatabase': 'د بازارموندنې ډیټابیس',
            'nav.templates': 'کينډۍ',
            'nav.settings': 'تنظیمات',
            'settings.account': 'حساب',
            'nav.downloadAndroid': 'د اندروید اپ ډاونلوډ',
            'nav.downloadAndroidHint': 'د ربط APK ترلاسه کړئ',
            'nav.assistance': 'مرسته ترلاسه کړئ',
            'nav.privacyPolicy': 'د محرمیت تګلاره',
            'nav.privacyHint': 'بشپړه د محرمیت تګلاره ولولئ',
            'nav.terms': 'د خدمت شرطونه',
            'nav.termsHint': 'بشپړ شرطونه ولولئ',
            'nav.chooseLanguage': 'د اپلیکیشن ژبه وټاکئ',
            'nav.chooseLanguageHint': 'د ربط ژبه بدل کړئ',
            'nav.shareInvite': 'خپل شخصي بلنه لینک شریک کړئ',
            'nav.shareInviteHint': 'ملګري ربط ته راوبلئ',
            'nav.signIn': 'ننوتل',
            'nav.signUp': 'نوملیکنه',
            'nav.signOut': 'وتل',
            'nav.tagline': 'یوه پلیټفارم',
            'nav.guestHint': 'ننوزئ چې بریښنالیک، واټساپ او ټلیګرام په یوه کاري ځای کې وکاروئ.',
            'nav.closeMenu': 'مینو تړل',
            'nav.openMenu': 'مینو پرانیستل',
            'nav.back': 'شاته',
            'nav.toggleTheme': 'بڼه بدل کړئ',
            'nav.connected': 'نښتی',
            'nav.disconnected': 'پرې شوی',
            'page.login': 'ننوتل',
            'page.signup': 'نوملیکنه',
            'page.privacy': 'د محرمیت تګلاره',
            'page.terms': 'د خدمت شرطونه',
            'page.language': 'ژبه',
            'page.invite': 'ملګري راوبلئ',
            'page.support': 'مرسته ترلاسه کړئ',
            'page.guide': 'د پلیټفارم بشپړ لارښود',
            'guide.lead': 'د ربط بشپړ لارښود: ننوتل، چینلونه نښلول، اړیکې واردول، کمپاین استول، مهالویش، او پایلې لوستل.',
            'page.verify': 'بریښنالیک تایید',
            'login.title': 'ننوتل',
            'login.hint': 'د ربط کاري ځای ته ننوزئ — بریښنالیک، واټساپ، ټلیګرام او مهالویش په یوه ځای کې.',
            'login.email': 'بریښنالیک',
            'login.password': 'پټنوم',
            'login.submit': 'ننوتل',
            'login.noAccount': 'حساب نه لرئ؟',
            'login.backHome': 'کور ته ستنیدل',
            'login.needCode': 'نوی کوډ غواړئ؟',
            'login.resend': 'کوډ بیا واستوئ',
            'login.enterCode': 'دلته یې ولیکئ',
            'login.or': 'یا',
            'login.forgot': 'پټنوم هیر شوی؟',
            'common.and': 'او',
            'signup.title': 'نوملیکنه',
            'signup.hint': 'په بریښنالیک حساب جوړ کړئ. ۶ رقمه کوډ در استوو، بیا خپل کاري ځای ته ننوزئ.',
            'signup.name': 'بشپړ نوم',
            'signup.password': 'پټنوم',
            'signup.submit': 'حساب جوړول',
            'signup.agreePrefix': 'په حساب جوړولو سره تاسو منئ',
            'signup.hasAccount': 'له مخکې حساب لرئ؟',
            'verify.title': 'کوډ ولیکئ',
            'verify.hint': '۶ رقمه کوډ مو بریښنالیک ته واستاوه. د حساب لپاره یې دلته ولیکئ. ۱۰ دقیقې اعتبار لري.',
            'verify.code': 'د تایید کوډ',
            'verify.submit': 'حساب تایید کړئ',
            'verify.noCode': 'کوډ ونه رسېد؟',
            'verify.verified': 'مخکې تایید شوی؟',
            'verify.back': 'ننوتلو ته ستنیدل',
            'page.forgot': 'پټنوم هیر شوی',
            'forgot.title': 'پټنوم هیر شوی',
            'forgot.hint': 'د حساب بریښنالیک ولیکئ. د پټنوم بیا تنظیم لپاره ۶ رقمه کوډ در استوو.',
            'forgot.sendCode': 'د بیا تنظیم کوډ واستوئ',
            'forgot.resetTitle': 'نوی پټنوم',
            'forgot.resetHint': 'د بریښنالیک ۶ رقمه کوډ ولیکئ او نوی پټنوم وټاکئ.',
            'forgot.code': 'د بیا تنظیم کوډ',
            'forgot.newPassword': 'نوی پټنوم',
            'forgot.confirmPassword': 'پټنوم تایید',
            'forgot.submit': 'پټنوم تازه کړئ',
            'forgot.back': 'ننوتلو ته ستنیدل',
            'forgot.remember': 'پټنوم مو یاد دی؟',
            'lang.title': 'د اپلیکیشن ژبه وټاکئ',
            'lang.lead': 'د مینو، تڼیو او د کاري ځای ټولو پاڼو ژبه وټاکئ. انتخاب په دې وسیله کې ساتل کېږي.',
            'lang.using': 'اوسنۍ ژبه',
            'invite.title': 'ملګري راوبلئ',
            'invite.lead': 'خپل شخصي بلنه لینک شریک کړئ. ملګري یې پرانیزي او په ربط کې حساب جوړوي.',
            'invite.copy': 'لینک کاپي کړئ',
            'invite.copied': 'لینک کاپي شو',
            'invite.share': 'شریکول',
            'invite.how': 'څنګه کار کوي',
            'invite.step1': 'خپل لینک کاپي یا شریک کړئ.',
            'invite.step2': 'ملګری لینک پرانیزي او نوملیکنه کوي.',
            'invite.step3': 'د بریښنالیک له تایید وروسته خپل کاري ځای ترلاسه کوي.',
            'invite.friends': 'هغه ملګري چې راغلل',
            'invite.empty': 'تر اوسه چا ستاسو لینک نه دی کارولی. یې شریک کړئ.',
            'invite.count': 'ستاسو په لینک راغلل',
            'signup.invitedBanner': 'یو ملګري تاسو ربط ته راوبلل. د شاملېدو لپاره حساب جوړ کړئ.',
            'support.title': 'د ملاتړ خبرې پرانیستل',
            'support.lead': 'د ربط ټیم ته پیغام واستوئ. سوپر اډمین به دلته ځواب ورکړي.',
            'support.placeholder': 'خپل پیغام ولیکئ…',
            'support.send': 'استول',
            'support.empty': 'له پلیټفارم ټیم سره خبرې پیل کړئ. د حساب، چینلونو یا ربط په اړه پوښتنه وکړئ.',
            'support.you': 'تاسو',
            'support.team': 'د ربط ملاتړ',
            'legal.privacyLead': 'بشپړه د محرمیت تګلاره ولولئ. دا پاڼه ښيي ربط کوم معلومات راټولوي، څنګه یې کاروي او ساتي، او تاسو کوم انتخابونه لرئ.',
            'legal.termsLead': 'بشپړ شرطونه ولولئ. دا شرطونه ستاسو او د ربط چلوونکي ترمنځ تړون دی.'
        }
    };

    if (window.RABT_GUIDE_STRINGS) {
        ['en', 'ar', 'fa', 'ps'].forEach(function (lang) {
            if (window.RABT_GUIDE_STRINGS[lang] && STRINGS[lang]) {
                Object.keys(window.RABT_GUIDE_STRINGS[lang]).forEach(function (key) {
                    STRINGS[lang][key] = window.RABT_GUIDE_STRINGS[lang][key];
                });
            }
        });
    }

    function normalize(id) {
        var value = String(id || '').toLowerCase();
        if (STRINGS[value]) return value;
        return 'en';
    }

    function current() {
        try {
            return normalize(localStorage.getItem(STORAGE_KEY) || 'en');
        } catch (_) {
            return 'en';
        }
    }

    function meta(id) {
        var lang = normalize(id || current());
        for (var i = 0; i < LANGS.length; i += 1) {
            if (LANGS[i].id === lang) return LANGS[i];
        }
        return LANGS[0];
    }

    function applyDir(id) {
        var info = meta(id);
        document.documentElement.lang = info.id;
        document.documentElement.dir = info.dir;
        document.documentElement.classList.toggle('rtl', info.dir === 'rtl');
    }

    var textOrig = typeof WeakMap === 'function' ? new WeakMap() : null;
    var attrOrig = typeof WeakMap === 'function' ? new WeakMap() : null;
    var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-placeholder'];
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, CANVAS: 1, KBD: 1, INPUT: 1, SELECT: 1 };
    var observeTimer = null;
    var observing = false;
    var applying = false;
    var pageTitleOrig = null;

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function phrase(en) {
        var raw = String(en == null ? '' : en);
        var lang = current();
        if (!raw) return raw;
        if (lang === 'en') return raw;
        var dict = window.RABT_I18N_PHRASES || {};
        var n = normalizeText(raw);
        if (dict[n] && dict[n][lang]) return dict[n][lang];
        var nums = [];
        var pat = n.replace(/\d[\d,]*(?:\.\d+)?%?/g, function (x) {
            nums.push(x);
            return '{n}';
        });
        if (pat !== n && dict[pat] && dict[pat][lang]) {
            var out = dict[pat][lang];
            for (var i = 0; i < nums.length; i += 1) out = out.replace('{n}', nums[i]);
            return out;
        }
        var enTable = STRINGS.en || {};
        for (var key in enTable) {
            if (enTable[key] === n && STRINGS[lang] && STRINGS[lang][key]) return STRINGS[lang][key];
        }
        return raw;
    }

    function t(key) {
        var lang = current();
        var table = STRINGS[lang] || STRINGS.en;
        if (table[key]) return table[key];
        if (STRINGS.en[key]) return phrase(STRINGS.en[key]);
        return phrase(key);
    }

    function skipTextParent(el) {
        if (!el) return true;
        if (SKIP_TAGS[el.tagName]) return true;
        if (el.isContentEditable) return true;
        if (el.closest && (
            el.closest('[contenteditable="true"]') ||
            el.closest('[data-i18n-skip]') ||
            el.closest('[data-i18n]') ||
            el.closest('[data-i18n-html]') ||
            (el.closest('.bubble') && el.tagName !== 'SMALL' && !el.closest('small'))
        )) return true;
        return false;
    }

    function skipAttrEl(el) {
        if (!el) return true;
        if (el.closest && (
            el.closest('[contenteditable="true"]') ||
            el.closest('[data-i18n-skip]') ||
            el.closest('[data-i18n-placeholder]') ||
            el.closest('[data-i18n-title]')
        )) return true;
        return false;
    }

    function isEnglishSource(value) {
        var n = normalizeText(value);
        if (!n || !/[A-Za-z]/.test(n)) return false;
        var dict = window.RABT_I18N_PHRASES || {};
        if (dict[n]) return true;
        var pat = n.replace(/\d[\d,]*(?:\.\d+)?%?/g, '{n}');
        if (pat !== n && dict[pat]) return true;
        var enTable = STRINGS.en || {};
        for (var key in enTable) {
            if (enTable[key] === n) return true;
        }
        return false;
    }

    function translateTextValue(original) {
        var translated = phrase(original);
        if (translated === normalizeText(original) || translated === original) return original;
        var lead = String(original).match(/^\s*/)[0];
        var trail = String(original).match(/\s*$/)[0];
        return lead + translated + trail;
    }

    function walkText(root) {
        if (!root) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue || !/[A-Za-z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                if (skipTextParent(node.parentElement)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var node;
        while ((node = walker.nextNode())) {
            var currentVal = node.nodeValue;
            var orig = textOrig && textOrig.get(node);
            if (!orig || (current() !== 'en' && isEnglishSource(currentVal))) {
                orig = currentVal;
                if (textOrig) textOrig.set(node, orig);
            }
            var next = current() === 'en' ? orig : translateTextValue(orig);
            if (next !== node.nodeValue) node.nodeValue = next;
        }
    }

    function walkAttrs(scope) {
        if (!scope || !scope.querySelectorAll) return;
        ATTRS.forEach(function (attr) {
            scope.querySelectorAll('[' + attr + ']').forEach(function (el) {
                if (skipAttrEl(el)) return;
                var bag = (attrOrig && attrOrig.get(el)) || {};
                if (!Object.prototype.hasOwnProperty.call(bag, attr)) {
                    bag[attr] = el.getAttribute(attr) || '';
                    if (attrOrig) attrOrig.set(el, bag);
                }
                var orig = bag[attr];
                if (!orig || !/[A-Za-z]/.test(orig)) return;
                var next = current() === 'en' ? orig : translateTextValue(orig);
                if (next !== el.getAttribute(attr)) el.setAttribute(attr, next);
            });
        });
    }

    function applyMarked(scope) {
        scope.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        });
        scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
            el.setAttribute('aria-label', t(el.getAttribute('data-i18n-title')));
        });
        var title = document.querySelector('title[data-i18n]');
        if (title) title.textContent = t(title.getAttribute('data-i18n')) + ' — ' + ((window.RabtCms && window.RabtCms.brand && window.RabtCms.brand.productName) || 'Rabط');
    }

    function apply(root) {
        var scope = root || document;
        applying = true;
        try {
            if (scope.querySelectorAll) applyMarked(scope);
            var walkRoot = scope.body || scope;
            walkText(walkRoot);
            walkAttrs(walkRoot);
            if (!pageTitleOrig) pageTitleOrig = document.title;
            if (!document.querySelector('title[data-i18n]')) {
                document.title = current() === 'en' ? pageTitleOrig : translateTextValue(pageTitleOrig);
            }
        } finally {
            applying = false;
        }
    }

    function scheduleApply(node) {
        clearTimeout(observeTimer);
        observeTimer = setTimeout(function () {
            apply(node && node.querySelectorAll ? node : document);
        }, 40);
    }

    function watch() {
        if (observing || !window.MutationObserver || !document.body) return;
        observing = true;
        var mo = new MutationObserver(function () {
            if (applying || current() === 'en') return;
            scheduleApply(document);
        });
        mo.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function set(id) {
        var lang = normalize(id);
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
        applyDir(lang);
        apply(document);
        document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: lang } }));
        return lang;
    }

    applyDir(current());

    window.RabtI18n = {
        langs: LANGS,
        t: t,
        phrase: phrase,
        get: current,
        set: set,
        meta: meta,
        apply: apply,
        applyCms: applyCmsDom,
        isRtl: function () { return !!RTL[current()]; }
    };

    function mergeCms(cms) {
        window.RabtCms = cms || {};
        var strings = (cms && cms.strings) || {};
        ['en', 'ar', 'fa', 'ps'].forEach(function (lang) {
            if (!STRINGS[lang]) STRINGS[lang] = {};
            if (strings[lang]) {
                Object.keys(strings[lang]).forEach(function (key) {
                    STRINGS[lang][key] = strings[lang][key];
                });
            }
        });
    }

    function applyCmsDom() {
        var cms = window.RabtCms || {};
        var pages = cms.pages || {};
        document.querySelectorAll('[data-cms]').forEach(function (el) {
            var key = el.getAttribute('data-cms');
            var val = pages[key];
            if (val == null || val === '') return;
            if (el.getAttribute('data-cms-html') === '1') el.innerHTML = val;
            else el.textContent = val;
        });
        var terms = document.getElementById('cmsLegalBody');
        if (terms && pages['legal.termsHtml']) terms.innerHTML = pages['legal.termsHtml'];
        var privacy = document.getElementById('cmsPrivacyBody');
        if (privacy && pages['legal.privacyHtml']) privacy.innerHTML = pages['legal.privacyHtml'];
        var termsMeta = document.getElementById('cmsTermsMeta');
        if (termsMeta && pages['legal.termsUpdated']) termsMeta.textContent = pages['legal.termsUpdated'];
        var privacyMeta = document.getElementById('cmsPrivacyMeta');
        if (privacyMeta && pages['legal.privacyUpdated']) privacyMeta.textContent = pages['legal.privacyUpdated'];
        var brand = cms.brand && cms.brand.productName;
        if (brand) {
            document.querySelectorAll('#appLogoText').forEach(function (el) { el.textContent = brand; });
            document.querySelectorAll('img.app-logo-img, img.app-header-mark').forEach(function (el) {
                el.setAttribute('alt', brand);
            });
            document.querySelectorAll('a.app-logo, a.app-header-mark-link').forEach(function (el) {
                el.setAttribute('title', brand);
            });
        }
    }

    window.RabtCmsReady = fetch('/api/cms', { credentials: 'same-origin' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            mergeCms(data && data.data);
            return window.RabtCms;
        })
        .catch(function () {
            mergeCms({});
            return window.RabtCms;
        });

    function boot() {
        var start = function () {
            applyCmsDom();
            apply(document);
            watch();
            document.addEventListener('auth-ready', function () { scheduleApply(document); });
            document.addEventListener('language-changed', function () { apply(document); });
        };
        window.RabtCmsReady.then(start);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
