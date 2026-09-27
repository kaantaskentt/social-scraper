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
