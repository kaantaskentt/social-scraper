// Shared by the server (Jev's questions) and the page (plain names for each answer).
// Jev's fixed questions over each description. Every question has a way out (unclear / other / none).
export const LABELS={
 presenter:['Who is on camera?',{nobody:'No person is visible',one_talking:'One person talking to the camera',one_doing:'One person doing something, not mainly talking to camera',two_or_more:'Two or more people',hands_only:'Only hands or body parts',unclear:'Cannot tell'}],
 look:['How does the main person look?',{doctor_or_expert:'Like a doctor, scientist or expert: coat, glasses, clinical or authoritative feel',casual_creator:'A casual everyday creator',chef_or_home_cook:'A cook in a kitchen',fitness:'Sporty or fitness look',business:'Office or business look',animated_or_ai:'Clearly animated or AI-generated',none:'No person',other:'Something else'}],
 setting:['Where is it filmed?',{studio_clean:'A clean, plain background or studio',kitchen:'A kitchen',home_room:'Another room in a home',outdoors:'Outdoors',office:'An office',public_place:'A shop, street or other public place',no_real_place:'No real place: graphics, text or images only',other:'Somewhere else'}],
 format:['What kind of video is it?',{talking_head:'Someone talks to camera most of the time',demonstration:'Someone shows or tests something step by step while explaining',satisfying_visual:'Satisfying visuals carry it: cleaning, pouring, peeling, before and after',faceless_clips:'Clips with a voiceover and no presenter',story_over_images:'A story told over images or scenes',acted_scene:'An acted scene or dialogue',text_or_slides:'Text or slides carry it',other:'Something else'}],
 sound:['What do you hear?',{voice_only:'A voice and no music',voice_with_music:'A voice with music underneath',music_only:'Music and no voice',effects_only:'Natural sound or effects, no voice or music',unclear:'Cannot tell'}],
 text:['What text is on screen?',{none:'No text on screen',captions:'Captions of what is said',headline:'A title or hook text, not captions',both:'Captions and a title',unclear:'Cannot tell'}],
 // Why people watch (research: disgust and contamination stories stick; fear persuades with one clear action; seeing it
 // happen makes it believable). Answers come from the description and the words.
 feel:['Which feeling do the first seconds create for the viewer?',{disgust:'Disgust: something gross, dirty or contaminated',fear_or_worry:'Fear or worry about a risk',curiosity:'Curiosity: a question the viewer wants answered',surprise:'Surprise at something unexpected',satisfaction:'Satisfaction: pleasing to watch, like cleaning or a perfect result',amusement:'Amusement or humor',awe:'Awe or wonder',calm_neutral:'Calm or neutral, no strong feeling',unclear:'Cannot tell'}],
 proof:['Does the video SHOW its main claim happening, or only say it?',{shows_it:'Shows it happening on camera: a test, demo or visible result',says_it:'Only says or explains it',neither:'Makes no real claim',unclear:'Cannot tell'}],
 action:['Using `spoken_words` too: does it give the viewer a clear thing to do?',{one_clear_action:'One clear, doable action',several_actions:'Several actions or steps',no_action:'No action for the viewer',unclear:'Cannot tell'}],
 angle:['Using `spoken_words` too: what is the angle?',{hidden_danger:'Something ordinary is secretly bad for you',myth_bust:'Busts a common belief',how_to:'Shows how to do or make something',result_or_transformation:'Shows a result or a before and after',story:'Tells a story',tips_list:'A list of tips',opinion:'An opinion or reaction',product:'About a product',entertainment:'Mainly entertainment',other:'Something else'}],
 opening:['How does it open?',{result_first:'Shows the result or the most striking image first',bold_claim:'A bold or surprising statement',question:'A question',action_in_progress:'Starts in the middle of an action',greeting_or_intro:'A greeting or introduction',other:'Something else'}]
};

// Short plain names for every answer, shown on the page (the long definitions stay as hover hints).
export const SHORT={
 presenter:{nobody:'No one on camera',one_talking:'One person talking',one_doing:'One person doing',two_or_more:'Two or more people',hands_only:'Hands only'},
 look:{doctor_or_expert:'Expert look',casual_creator:'Casual creator',chef_or_home_cook:'Home cook',fitness:'Fitness look',business:'Business look',animated_or_ai:'Animated or AI',none:'No person'},
 setting:{studio_clean:'Clean studio',kitchen:'Kitchen',home_room:'Room at home',outdoors:'Outdoors',office:'Office',public_place:'Public place',no_real_place:'No real place'},
 format:{talking_head:'Talking head',demonstration:'Demonstration',satisfying_visual:'Satisfying visuals',faceless_clips:'Faceless clips and voiceover',story_over_images:'Story over images',acted_scene:'Acted scene',text_or_slides:'Text or slides'},
 sound:{voice_only:'Voice only',voice_with_music:'Voice and music',music_only:'Music only',effects_only:'Natural sound only'},
 text:{none:'No text on screen',captions:'Captions',headline:'Title text',both:'Captions and title'},
 opening:{result_first:'Result first',bold_claim:'Bold claim first',question:'Question first',action_in_progress:'Starts mid-action',greeting_or_intro:'Greeting or intro'},
 feel:{disgust:'Disgust',fear_or_worry:'Fear or worry',curiosity:'Curiosity',surprise:'Surprise',satisfaction:'Satisfying to watch',amusement:'Humor',awe:'Awe',calm_neutral:'Calm'},
 proof:{shows_it:'Shows it happen',says_it:'Only says it',neither:'No real claim'},
 action:{one_clear_action:'One clear action',several_actions:'Several steps',no_action:'No action to take'},
 angle:{hidden_danger:'Hidden danger',myth_bust:'Myth busting',how_to:'How-to',result_or_transformation:'Before and after',story:'Story',tips_list:'Tips list',opinion:'Opinion',product:'Product focus',entertainment:'Entertainment'},
 said_mechanism:{contradiction:'Challenges a belief',curiosity:'Holds back the answer',result:'Promises a result',mistake:'Warns of a mistake',recognition:'Names your situation',story:'Starts a story',direct:'Says it straight'},
 said_opening:{question:'Opens with a question',instruction:'Opens with "do this"',claim:'Opens with a claim',story:'Opens with a story',dialogue:'Opens with dialogue'},
 said_structure:{story:'Story',steps:'Step by step',problem_solution:'Problem, then fix',explanation:'Explains how or why',comparison:'Compares options',opinion:'Opinion',qa:'Questions and answers'},
 said_evidence:{example:'Shows an example',personal:'Personal story',numbers:'Uses numbers',source:'Cites a source',reasoning:'Explains instead of showing',none:'No proof given'},
 said_emotion:{aspiration:'Aspiration',concern:'Worry or risk',relief:'Relief',surprise:'Surprise',amusement:'Humor',neutral:'Neutral tone'},
 said_specificity:{none:'No advice',principle:'General advice',action:'One clear action',sequence:'Steps to follow'},
 said_cta:{none:'No ask',follow:'Asks to follow',engage:'Asks to like, save or share',comment:'Asks to comment',visit:'Sends to a link',buy:'Asks to buy',multiple:'Several asks'}
};

// One plain sentence per answer, for the "Do these" cards: what it looks like in a reel.
export const PLAIN={
 presenter:{nobody:'Nobody is on camera.',one_talking:'One person talks straight to the camera.',one_doing:'One person does something while you watch.',two_or_more:'Two or more people are in the video together.',hands_only:'You only see hands.'},
 look:{doctor_or_expert:'The presenter looks like an expert.',casual_creator:'The presenter looks like a normal, relaxed person.',chef_or_home_cook:'The presenter looks like a home cook.',fitness:'The presenter looks sporty.',business:'The presenter looks like an office worker.',animated_or_ai:'The presenter is animated or made by AI.',none:'There is no presenter.'},
 setting:{studio_clean:'It is filmed in front of a clean, plain background.',kitchen:'It is filmed in a kitchen.',home_room:'It is filmed in a room at home.',outdoors:'It is filmed outside.',office:'It is filmed in an office.',public_place:'It is filmed in a shop or on the street.',no_real_place:'There is no real place, only graphics or text.'},
 format:{talking_head:'Someone talks to the camera most of the time.',demonstration:'Someone shows or tests something, step by step.',satisfying_visual:'The pictures are satisfying to watch, like cleaning or pouring.',faceless_clips:'You see clips while a voice explains, no presenter.',story_over_images:'A story is told over pictures.',acted_scene:'People act out a little scene.',text_or_slides:'Text on screen tells the story.'},
 sound:{voice_only:'You only hear a voice, no music.',voice_with_music:'A voice talks with music underneath.',music_only:'There is only music, no talking.',effects_only:'You only hear the real sounds of what happens.'},
 text:{none:'There is no text on screen.',captions:'The words appear on screen as they are said.',headline:'A big title sits on screen.',both:'There are captions and a title.'},
 opening:{result_first:'It shows the end result first.',bold_claim:'It opens with a surprising sentence.',question:'It opens with a question.',action_in_progress:'The action is already happening in the first second.',greeting_or_intro:'It opens by saying hello or introducing itself.'},
 feel:{disgust:'It makes you go "ew".',fear_or_worry:'It makes you a little worried.',curiosity:'It makes you want to know what happens.',surprise:'Something surprising happens.',satisfaction:'It is satisfying to watch.',amusement:'It is funny.',awe:'It makes you go "wow".',calm_neutral:'It feels calm.'},
 proof:{shows_it:'You see it happen with your own eyes.',says_it:'They only talk about it, you do not see it.',neither:'There is no real claim.'},
 action:{one_clear_action:'It gives you one simple thing to do.',several_actions:'It gives you a few steps to follow.',no_action:'It does not tell you to do anything.'},
 angle:{hidden_danger:'Something normal turns out to be bad for you.',myth_bust:'It proves a common belief wrong.',how_to:'It shows you how to do something.',result_or_transformation:'It shows a before and after.',story:'It tells a story.',tips_list:'It gives a list of tips.',opinion:'It shares an opinion.',product:'It is about a product.',entertainment:'It is mainly for fun.'},
 said_mechanism:{contradiction:'It says the opposite of what you believe.',curiosity:'It teases the answer and shows it later, so you keep watching.',result:'It promises a result you want.',mistake:'It warns you about a mistake.',recognition:'It describes a problem you know.',story:'It starts a story you want to finish.',direct:'It just says what it is about.'},
 said_opening:{question:'The first words are a question.',instruction:'The first words tell you to do something ("do this and watch").',claim:'The first words are a statement.',story:'The first words start a story.',dialogue:'The first words are people talking to each other.'},
 said_structure:{story:'It is told as a story.',steps:'It goes step by step, like a recipe.',problem_solution:'It names a problem, then sells a fix.',explanation:'It explains how or why something works.',comparison:'It compares two things.',opinion:'It argues an opinion.',qa:'It is questions and answers.'},
 said_evidence:{example:'It shows an example.',personal:'It tells a personal story.',numbers:'It uses numbers.',source:'It names a source.',reasoning:'It explains with words instead of showing.',none:'It gives no proof.'},
 said_emotion:{aspiration:'It makes you want something better.',concern:'It makes you worried.',relief:'It makes you feel relieved.',surprise:'It surprises you.',amusement:'It is funny.',neutral:'It is calm and factual.'},
 said_specificity:{none:'It gives no advice.',principle:'It gives general advice.',action:'It gives one clear thing to do.',sequence:'It gives steps you can follow.'},
 said_cta:{none:'It does not ask you for anything.',follow:'It asks you to follow.',engage:'It asks you to like, save or share.',comment:'It asks you to comment.',visit:'It sends you to a link.',buy:'It asks you to buy.',multiple:'It asks you for several things at the end.'}
};
