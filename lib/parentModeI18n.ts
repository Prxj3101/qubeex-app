// Shared translation dictionary for Parent Mode. This covers the STATIC UI
// text that lives across ParentModeView.tsx and the components it embeds
// (ReportCardSheet, AttendanceSheet, FlagsSheet) — section titles, table
// headers, legends, button labels, status words, and so on.
//
// It deliberately does NOT translate teacher-entered free text (Conduct/
// Remarks, PTM notes, flag titles/details, subject names, student names) —
// that's real data typed by a teacher/admin in whatever language they used,
// and translating it correctly needs an actual translation service, not a
// hardcoded dictionary. That's a separate, later piece of work.
//
// "Hinglish" isn't a real ISO locale — it's an informal Latin-script mix of
// Hindi and English that a lot of Indian parents read most comfortably. Its
// entries below are written the way that mix is actually spoken/read, not
// machine-transliterated Hindi.

export type ParentLang = 'en' | 'hinglish' | 'hi' | 'mr';

export const PARENT_LANGUAGES: { code: ParentLang; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'hinglish', label: 'Hinglish' },
    { code: 'hi', label: 'हिंदी' },
    { code: 'mr', label: 'मराठी' },
];

type Dict = Record<string, Record<ParentLang, string>>;

const DICT: Dict = {
    // ── ParentModeView: header, section titles ──
    parentMode: { en: 'Parent Mode', hinglish: 'Parent Mode', hi: 'पेरेंट मोड', mr: 'पालक मोड' },
    aiSnapshot: { en: 'AI Snapshot', hinglish: 'AI Snapshot', hi: 'एआई सारांश', mr: 'एआय सारांश' },
    subjectPerformance: { en: 'Subject Performance', hinglish: 'Subject Performance', hi: 'विषय प्रदर्शन', mr: 'विषय कामगिरी' },
    attendance: { en: 'Attendance', hinglish: 'Attendance', hi: 'उपस्थिति', mr: 'उपस्थिती' },
    overallAttendanceTrend: { en: 'Overall Attendance Trend', hinglish: 'Overall Attendance Trend', hi: 'कुल उपस्थिति का रुझान', mr: 'एकूण उपस्थितीचा कल' },
    present: { en: 'Present', hinglish: 'Present', hi: 'उपस्थित', mr: 'उपस्थित' },
    absent: { en: 'Absent', hinglish: 'Absent', hi: 'अनुपस्थित', mr: 'अनुपस्थित' },
    late: { en: 'Late', hinglish: 'Late', hi: 'देर से आया', mr: 'उशीर' },
    legendGood: { en: 'Good ≥75%', hinglish: 'Good ≥75%', hi: 'अच्छा ≥७५%', mr: 'चांगले ≥७५%' },
    legendCondonation: { en: 'Condonation 65–74%', hinglish: 'Condonation 65–74%', hi: 'छूट क्षेत्र ६५–७४%', mr: 'सूट क्षेत्र ६५–७४%' },
    legendDefaulter: { en: 'Defaulter <65%', hinglish: 'Defaulter <65%', hi: 'डिफॉल्टर <६५%', mr: 'डिफॉल्टर <६५%' },
    statusGood: { en: 'Good', hinglish: 'Good', hi: 'अच्छा', mr: 'चांगले' },
    statusCondonation: { en: 'Condonation Zone', hinglish: 'Condonation Zone', hi: 'छूट क्षेत्र', mr: 'सूट क्षेत्र' },
    statusDefaulter: { en: 'Defaulter', hinglish: 'Defaulter', hi: 'डिफॉल्टर', mr: 'डिफॉल्टर' },
    statusNoData: { en: 'No data yet', hinglish: 'Abhi data nahi hai', hi: 'अभी तक कोई डेटा नहीं', mr: 'अजून डेटा नाही' },
    remarksFlagsWarnings: { en: 'Remarks: Flags & Warnings', hinglish: 'Remarks: Flags & Warnings', hi: 'टिप्पणियाँ: फ्लैग और चेतावनी', mr: 'शेरे: फ्लॅग आणि इशारे' },
    meetingNotes: { en: 'PTM Notes', hinglish: 'PTM Notes', hi: 'पीटीएम नोट्स', mr: 'पीटीएम नोट्स' },
    acknowledged: { en: 'Acknowledged', hinglish: 'Acknowledged', hi: 'स्वीकृत', mr: 'मान्य केले' },
    discussedAcknowledge: { en: 'Discussed & Acknowledge', hinglish: 'Discuss karke Acknowledge karein', hi: 'चर्चा करें और स्वीकार करें', mr: 'चर्चा करा आणि मान्य करा' },
    shareSummary: { en: 'Share Summary', hinglish: 'Summary Share karein', hi: 'सारांश साझा करें', mr: 'सारांश शेअर करा' },
    viewFullReportCardPdf: { en: 'View Full Report Card PDF', hinglish: 'Poora Report Card PDF dekhein', hi: 'पूरा रिपोर्ट कार्ड पीडीएफ देखें', mr: 'संपूर्ण रिपोर्ट कार्ड पीडीएफ पहा' },
    yellowCards: { en: 'Yellow Cards', hinglish: 'Yellow Cards', hi: 'पीले कार्ड', mr: 'पिवळे कार्ड' },
    redCards: { en: 'Red Cards', hinglish: 'Red Cards', hi: 'लाल कार्ड', mr: 'लाल कार्ड' },

    // ── ReportCardSheet ──
    reportCard: { en: 'Report Card', hinglish: 'Report Card', hi: 'रिपोर्ट कार्ड', mr: 'रिपोर्ट कार्ड' },
    offline: { en: 'offline', hinglish: 'offline', hi: 'ऑफलाइन', mr: 'ऑफलाइन' },
    online: { en: 'online', hinglish: 'online', hi: 'ऑनलाइन', mr: 'ऑनलाइन' },
    subjects: { en: 'Subjects', hinglish: 'Subjects', hi: 'विषय', mr: 'विषय' },
    total: { en: 'Total', hinglish: 'Total', hi: 'कुल', mr: 'एकूण' },
    grade: { en: 'Grade', hinglish: 'Grade', hi: 'ग्रेड', mr: 'श्रेणी' },
    testsAndMarks: { en: 'Tests & Marks', hinglish: 'Tests & Marks', hi: 'टेस्ट और अंक', mr: 'चाचण्या आणि गुण' },
    gradedSubjects: { en: 'Graded Subjects', hinglish: 'Graded Subjects', hi: 'ग्रेडेड विषय', mr: 'श्रेणीबद्ध विषय' },
    term1: { en: 'Term 1', hinglish: 'Term 1', hi: 'टर्म 1', mr: 'टर्म 1' },
    term2: { en: 'Term 2', hinglish: 'Term 2', hi: 'टर्म 2', mr: 'टर्म 2' },
    grandTotal: { en: 'Grand Total', hinglish: 'Grand Total', hi: 'कुल योग', mr: 'एकूण बेरीज' },
    resultsNotPublished: { en: 'Results not published yet.', hinglish: 'Results abhi publish nahi hue hain.', hi: 'परिणाम अभी प्रकाशित नहीं हुए हैं।', mr: 'निकाल अजून प्रकाशित झालेले नाहीत.' },
    noCompletedTests: { en: 'No completed tests yet', hinglish: 'Abhi koi test complete nahi hua', hi: 'अभी तक कोई टेस्ट पूरा नहीं हुआ', mr: 'अजून कोणतीही चाचणी पूर्ण झालेली नाही' },
    onlineResultsAppearHere: { en: 'Online results appear here once a test is completed', hinglish: 'Test complete hote hi online results yahan dikhenge', hi: 'टेस्ट पूरा होते ही ऑनलाइन परिणाम यहाँ दिखेंगे', mr: 'चाचणी पूर्ण झाल्यावर ऑनलाइन निकाल इथे दिसतील' },
    legendPassGood: { en: '≥75% Pass', hinglish: '≥75% Pass', hi: '≥७५% पास', mr: '≥७५% पास' },
    legendPassOk: { en: '35–74% Pass', hinglish: '35–74% Pass', hi: '३५–७४% पास', mr: '३५–७४% पास' },
    legendFail: { en: '<35% Fail', hinglish: '<35% Fail', hi: '<३५% फेल', mr: '<३५% नापास' },
    conductLabel: { en: 'Conduct', hinglish: 'Conduct', hi: 'आचरण', mr: 'वर्तन' },
    remarksLabel: { en: 'Remarks', hinglish: 'Remarks', hi: 'टिप्पणी', mr: 'शेरा' },

    // ── AttendanceSheet ──
    attendanceSheet: { en: 'Attendance Sheet', hinglish: 'Attendance Sheet', hi: 'उपस्थिति पत्रक', mr: 'उपस्थिती पत्रक' },
    month: { en: 'Month', hinglish: 'Month', hi: 'महीना', mr: 'महिना' },
    rollNo: { en: 'Roll No.', hinglish: 'Roll No.', hi: 'रोल नंबर', mr: 'रोल नंबर' },
    noAttendanceRecords: { en: 'No attendance records yet.', hinglish: 'Abhi koi attendance record nahi hai.', hi: 'अभी तक कोई उपस्थिति रिकॉर्ड नहीं है।', mr: 'अजून कोणतीही उपस्थिती नोंद नाही.' },

    // ── FlagsSheet ──
    yellowCard: { en: 'Yellow Card', hinglish: 'Yellow Card', hi: 'पीला कार्ड', mr: 'पिवळे कार्ड' },
    redCard: { en: 'Red Card', hinglish: 'Red Card', hi: 'लाल कार्ड', mr: 'लाल कार्ड' },
    flagsSuffix: { en: 'flags', hinglish: 'flags', hi: 'फ्लैग', mr: 'फ्लॅग' },
    noYellowCards: { en: 'No yellow cards!', hinglish: 'Koi yellow card nahi!', hi: 'कोई पीला कार्ड नहीं!', mr: 'पिवळे कार्ड नाहीत!' },
    noRedCards: { en: 'No red cards!', hinglish: 'Koi red card nahi!', hi: 'कोई लाल कार्ड नहीं!', mr: 'लाल कार्ड नाहीत!' },
    incidentDetail: { en: '📝 Incident Detail', hinglish: '📝 Incident Detail', hi: '📝 घटना विवरण', mr: '📝 घटनेचा तपशील' },
    actionTaken: { en: '⚡ Action Taken', hinglish: '⚡ Action Taken', hi: '⚡ की गई कार्रवाई', mr: '⚡ केलेली कारवाई' },
    wantToAppeal: { en: 'Want to appeal a flag?', hinglish: 'Flag pe appeal karna hai?', hi: 'किसी फ्लैग पर अपील करनी है?', mr: 'एखाद्या फ्लॅगवर अपील करायची आहे?' },
    contactTeacherPrincipal: { en: 'Contact your class teacher or Principal.', hinglish: 'Apne class teacher ya Principal se contact karein.', hi: 'अपने कक्षा शिक्षक या प्रिंसिपल से संपर्क करें।', mr: 'तुमच्या वर्गशिक्षक किंवा मुख्याध्यापकांशी संपर्क साधा.' },
    // ── Parent ↔ teacher chat ──
    parentMessages: { en: 'Messages', hinglish: 'Messages', hi: 'संदेश', mr: 'संदेश' },
    messageTeachersSub: { en: "Message your child's teachers", hinglish: 'Apne bacche ke teachers ko message karein', hi: 'अपने बच्चे के शिक्षकों को संदेश भेजें', mr: 'तुमच्या मुलाच्या शिक्षकांना संदेश पाठवा' },
    classTeacherTag: { en: 'Class teacher', hinglish: 'Class teacher', hi: 'कक्षा शिक्षक', mr: 'वर्गशिक्षक' },
    typeMessage: { en: 'Type a message…', hinglish: 'Message likhein…', hi: 'संदेश लिखें…', mr: 'संदेश लिहा…' },
    sendMessage: { en: 'Send', hinglish: 'Send', hi: 'भेजें', mr: 'पाठवा' },
    noChatYet: { en: 'No messages yet. Say hello to start the conversation.', hinglish: 'Abhi koi message nahi hai. Baat shuru karne ke liye hello bolein.', hi: 'अभी कोई संदेश नहीं है। बातचीत शुरू करने के लिए नमस्ते कहें।', mr: 'अजून कोणताही संदेश नाही. संभाषण सुरू करण्यासाठी नमस्कार म्हणा.' },
    chatAdminNotice: { en: 'School administrators can view these conversations.', hinglish: 'School administrators in conversations ko dekh sakte hain.', hi: 'स्कूल प्रशासक इन बातचीत को देख सकते हैं।', mr: 'शाळेचे प्रशासक हे संभाषण पाहू शकतात.' },
    chatOutsideHours: { en: "Teachers reply during school hours. They'll see your message when they're back.", hinglish: 'Teachers school hours mein reply karte hain. Wapas aate hi woh aapka message dekhenge.', hi: 'शिक्षक स्कूल के समय में जवाब देते हैं। लौटते ही वे आपका संदेश देखेंगे।', mr: 'शिक्षक शाळेच्या वेळेत उत्तर देतात. परत आल्यावर ते तुमचा संदेश पाहतील.' },
    messageRemoved: { en: 'This message was removed by the school.', hinglish: 'Yeh message school ne hata diya hai.', hi: 'यह संदेश स्कूल द्वारा हटा दिया गया है।', mr: 'हा संदेश शाळेने काढून टाकला आहे.' },
    noClassTeachers: { en: 'No teachers are assigned to your class yet.', hinglish: 'Abhi aapki class ke liye koi teacher assign nahi hai.', hi: 'अभी आपकी कक्षा के लिए कोई शिक्षक नियुक्त नहीं है।', mr: 'अजून तुमच्या वर्गासाठी कोणताही शिक्षक नेमलेला नाही.' },
    chatTurnedOff: { en: 'Chat is turned off by your school.', hinglish: 'Aapke school ne chat band kar rakhi hai.', hi: 'आपके स्कूल ने चैट बंद कर रखी है।', mr: 'तुमच्या शाळेने चॅट बंद केली आहे.' },
    attachPhoto: { en: 'Photo', hinglish: 'Photo', hi: 'फ़ोटो', mr: 'फोटो' },
    attachPdf: { en: 'PDF', hinglish: 'PDF', hi: 'पीडीएफ', mr: 'पीडीएफ' },
    reportMessageAction: { en: 'Report message', hinglish: 'Message report karein', hi: 'संदेश की रिपोर्ट करें', mr: 'संदेशाची तक्रार करा' },
    reportConfirmBody: { en: 'The school administrator will be notified and will review this message.', hinglish: 'School administrator ko inform kiya jayega aur woh is message ko review karenge.', hi: 'स्कूल प्रशासक को सूचित किया जाएगा और वे इस संदेश की समीक्षा करेंगे।', mr: 'शाळेच्या प्रशासकांना कळवले जाईल आणि ते या संदेशाचा आढावा घेतील.' },
    reportedTag: { en: 'Reported', hinglish: 'Reported', hi: 'रिपोर्ट किया गया', mr: 'तक्रार केली' },
    cancelAction: { en: 'Cancel', hinglish: 'Cancel', hi: 'रद्द करें', mr: 'रद्द करा' },
    attachFailed: { en: 'Could not upload the file', hinglish: 'File upload nahi ho paayi', hi: 'फ़ाइल अपलोड नहीं हो सकी', mr: 'फाइल अपलोड करता आली नाही' },
    // ── Parent forms (permission slips & polls) ──
    formsTitle: { en: 'Forms & polls', hinglish: 'Forms & polls', hi: 'फ़ॉर्म और पोल', mr: 'फॉर्म आणि पोल' },
    formsSub: { en: 'Permission slips and quick polls from school', hinglish: 'School ke permission slips aur polls', hi: 'स्कूल के अनुमति पत्र और पोल', mr: 'शाळेचे परवानगी पत्र आणि पोल' },
    noForms: { en: 'Nothing to answer right now.', hinglish: 'Abhi koi form nahi hai.', hi: 'अभी जवाब देने के लिए कुछ नहीं है।', mr: 'सध्या उत्तर द्यायला काही नाही.' },
    slipTag: { en: 'Permission slip', hinglish: 'Permission slip', hi: 'अनुमति पत्र', mr: 'परवानगी पत्र' },
    pollTag: { en: 'Poll', hinglish: 'Poll', hi: 'पोल', mr: 'पोल' },
    replyBy: { en: 'Reply by', hinglish: 'Reply karein', hi: 'जवाब की अंतिम तिथि', mr: 'उत्तराची अंतिम तारीख' },
    formClosedTag: { en: 'Closed', hinglish: 'Closed', hi: 'बंद', mr: 'बंद' },
    answeredTag: { en: 'Answered', hinglish: 'Answered', hi: 'उत्तर दिया', mr: 'उत्तर दिले' },
    pendingTag: { en: 'Needs answer', hinglish: 'Jawab dena hai', hi: 'जवाब देना है', mr: 'उत्तर द्यायचे आहे' },
    submitAnswer: { en: 'Submit answer', hinglish: 'Answer submit karein', hi: 'जवाब भेजें', mr: 'उत्तर पाठवा' },
    changeAnswer: { en: 'Change answer', hinglish: 'Answer badlein', hi: 'जवाब बदलें', mr: 'उत्तर बदला' },
    addNoteOptional: { en: 'Add a note (optional)', hinglish: 'Note likhein (optional)', hi: 'नोट जोड़ें (वैकल्पिक)', mr: 'टीप जोडा (ऐच्छिक)' },
    answerSaved: { en: 'Your answer was saved', hinglish: 'Aapka answer save ho gaya', hi: 'आपका जवाब सहेज लिया गया', mr: 'तुमचे उत्तर जतन केले' },
    sentBy: { en: 'From', hinglish: 'Bhejne wale', hi: 'भेजने वाले', mr: 'पाठवणारे' },

    // ── PTM scheduler ──
    ptmTitle: { en: 'Parent-teacher meetings', hinglish: 'Parent-teacher meetings', hi: 'अभिभावक-शिक्षक बैठक', mr: 'पालक-शिक्षक बैठक' },
    ptmSub: { en: "Book a time with your child's teachers", hinglish: 'Teachers ke saath time book karein', hi: 'शिक्षकों के साथ समय बुक करें', mr: 'शिक्षकांसोबत वेळ बुक करा' },
    noPtm: { en: 'No meetings open for booking.', hinglish: 'Abhi booking ke liye koi meeting nahi hai.', hi: 'बुकिंग के लिए कोई बैठक उपलब्ध नहीं है।', mr: 'बुकिंगसाठी कोणतीही बैठक उपलब्ध नाही.' },
    yourSlot: { en: 'Your slot', hinglish: 'Aapka slot', hi: 'आपका स्लॉट', mr: 'तुमची वेळ' },
    slotsLeft: { en: 'slots left', hinglish: 'slots bache hain', hi: 'स्लॉट बाकी', mr: 'वेळा शिल्लक' },
    bookThisSlot: { en: 'Book this slot?', hinglish: 'Yeh slot book karein?', hi: 'यह स्लॉट बुक करें?', mr: 'ही वेळ बुक करायची?' },
    bookAction: { en: 'Book', hinglish: 'Book karein', hi: 'बुक करें', mr: 'बुक करा' },
    cancelBookingAction: { en: 'Cancel booking', hinglish: 'Booking cancel karein', hi: 'बुकिंग रद्द करें', mr: 'बुकिंग रद्द करा' },
    cancelBookingBody: { en: 'Free this slot for other parents?', hinglish: 'Kya yeh slot dusre parents ke liye khali karein?', hi: 'क्या यह स्लॉट दूसरे अभिभावकों के लिए खाली करें?', mr: 'ही वेळ इतर पालकांसाठी मोकळी करायची?' },
    cantCancelSoon: { en: 'Within 2 hours of the slot — contact the teacher to change it.', hinglish: 'Slot ke 2 ghante ke andar — badalne ke liye teacher se baat karein.', hi: 'स्लॉट से 2 घंटे के भीतर — बदलने के लिए शिक्षक से संपर्क करें।', mr: 'वेळेच्या २ तासांच्या आत — बदलण्यासाठी शिक्षकांशी संपर्क साधा.' },
    bookedConfirmed: { en: 'Slot booked', hinglish: 'Slot book ho gaya', hi: 'स्लॉट बुक हो गया', mr: 'वेळ बुक झाली' },

    // ── My Bus (live school bus) ──
    myBus: { en: 'My Bus', hinglish: 'Meri Bus', hi: 'मेरी बस', mr: 'माझी बस' },
    myBusSub: { en: 'See where the school bus is', hinglish: 'School bus kahan hai dekhein', hi: 'स्कूल बस कहाँ है देखें', mr: 'शाळेची बस कुठे आहे ते पहा' },
    busLive: { en: 'Live', hinglish: 'Live', hi: 'लाइव', mr: 'लाइव्ह' },
    busOffline: { en: 'Not live right now', hinglish: 'Abhi live nahi hai', hi: 'अभी लाइव नहीं है', mr: 'सध्या लाइव्ह नाही' },
    busOfflineHint: { en: 'The bus location shows here while the bus is running.', hinglish: 'Bus chalti hai tab uski location yahan dikhegi.', hi: 'बस चलते समय उसकी लोकेशन यहाँ दिखेगी।', mr: 'बस सुरू असताना तिचे ठिकाण इथे दिसेल.' },
    busMinAway: { en: '~{n} min from your stop', hinglish: 'Aapke stop se ~{n} min door', hi: 'आपके स्टॉप से ~{n} मिनट दूर', mr: 'तुमच्या थांब्यापासून ~{n} मिनिटे दूर' },
    busAtStop: { en: 'At your stop now', hinglish: 'Abhi aapke stop pe hai', hi: 'अभी आपके स्टॉप पर है', mr: 'आत्ता तुमच्या थांब्यावर आहे' },
    busUpdated: { en: 'Updated {t}', hinglish: 'Update: {t}', hi: 'अपडेट: {t}', mr: 'अपडेट: {t}' },
    yourStop: { en: 'Your stop', hinglish: 'Aapka stop', hi: 'आपका स्टॉप', mr: 'तुमचा थांबा' },
    noStopYet: { en: 'Stop not set yet. Please ask the school.', hinglish: 'Stop abhi set nahi hai. School se poochein.', hi: 'स्टॉप अभी तय नहीं है। स्कूल से पूछें।', mr: 'थांबा अजून ठरलेला नाही. शाळेला विचारा.' },
    pickupTime: { en: 'Pickup', hinglish: 'Pickup', hi: 'पिकअप', mr: 'पिकअप' },
    dropTime: { en: 'Drop', hinglish: 'Drop', hi: 'ड्रॉप', mr: 'ड्रॉप' },
    plannedTimeHint: { en: 'Planned times. The live location above is exact.', hinglish: 'Ye planned time hai. Upar live location sahi hai.', hi: 'ये अनुमानित समय हैं। ऊपर की लाइव लोकेशन सही है।', mr: 'हे अंदाजे वेळ आहेत. वरचे लाइव्ह ठिकाण अचूक आहे.' },
    morningShift: { en: 'Morning shift', hinglish: 'Morning shift', hi: 'सुबह की पाली', mr: 'सकाळची पाळी' },
    afternoonShift: { en: 'Afternoon shift', hinglish: 'Afternoon shift', hi: 'दोपहर की पाली', mr: 'दुपारची पाळी' },
    busDriver: { en: 'Driver', hinglish: 'Driver', hi: 'ड्राइवर', mr: 'चालक' },
    callDriver: { en: 'Call', hinglish: 'Call karein', hi: 'कॉल करें', mr: 'कॉल करा' },
    busLoadError: { en: 'Could not load the bus', hinglish: 'Bus load nahi hui', hi: 'बस लोड नहीं हुई', mr: 'बस लोड झाली नाही' },
};

// Hindi and Marathi both use Devanagari numerals (०-९) — this converts any
// Western digits (0-9) inside a string/number to their Devanagari
// equivalents when lang is 'hi'/'mr', and leaves 'en'/'hinglish' untouched
// (Hinglish stays Latin-script, same as its text). Non-digit characters
// (%, /, spaces, decimal points, etc.) pass through unchanged, so this is
// safe to wrap around ANY already-formatted numeric string.
const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
export function n(value: string | number, lang: ParentLang): string {
    const str = String(value);
    if (lang !== 'hi' && lang !== 'mr') return str;
    return str.replace(/[0-9]/g, d => DEVANAGARI_DIGITS[Number(d)]);
}

export function t(key: keyof typeof DICT, lang: ParentLang): string {
    return DICT[key]?.[lang] ?? DICT[key]?.en ?? String(key);
}
