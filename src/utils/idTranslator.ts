// Groups of common characters organized by their Pinyin initials to avoid duplicates
const groups: Record<string, string> = {
  'A': '阿安鞍澳鵪',
  'B': '包貝鱉白半薄冰八巴把爸罷百擺敗班板版辦伴幫綁磅胞寶飽報抱豹被奔本崩逼鼻比筆彼碧避畢閉邊編便變標表憋別撥波玻勃博搏補捕不步部箔',
  'C': '草材寵擦猜才財裁採彩踩菜參餐殘蠶慘慘燦倉藏操曹冊側測策層叉插查茶差拆柴產長場嘗常廠唱超朝潮吵炒車扯徹撤塵臣沉辰晨稱撐成呈承程懲澄橙吃池馳遲持尺齒赤斥翅充沖蟲崇抽仇綢愁稠醜臭出初除廚處川穿傳船喘串創吹炊垂春純唇醇戳此次聰從湊粗醋促趣脆翠村存寸措錯鶉',
  'D': '大地丁凍蛋袋德冬多度戴帶代貸待怠擔膽旦但誕彈當擋黨蕩刀導島倒到稻悼道盜得的燈等鄧低滴敵底抵第帝弟遞締顛點電店墊殿刁雕吊釣調掉爹跌疊碟盯叮頂鼎訂丟東董懂動棟洞兜抖陡斗豆逗都督毒獨讀堵賭杜渡肚端短段斷鍛堆隊對兌噸蹲盾頓奪朵躲剁墮',
  'E': '鵝額惡餓恩兒耳二',
  'F': '番粉肺發乏伐罰法藩翻凡煩繁反返犯防妨房仿訪放飛非肥匪費廢分芬紛墳份奮憤風封瘋逢馮諷鳳佛否夫膚伏扶服浮符幅福撫府俯輔腐父付婦負附副覆',
  'G': '乾狗干瓜罐骨鮭改概蓋甘肝柑桿感敢剛鋼港高糕搞稿告哥歌格隔個各給根跟更耕工弓公功攻供宮恭共貢勾溝夠估姑孤古股鼓固故顧刮掛怪官觀管館慣灌光廣逛規歸軌鬼櫃貴桂滾棍郭國果裹過',
  'H': '黃海花黑耗紅火烘後合盒河和何核荷賀赫痕很狠恨橫衡宏洪虹喉猴吼厚候乎呼忽弧胡湖糊蝴虎互戶護華滑化劃畫話懷淮壞歡環緩幻換喚患荒慌皇晃灰恢回毀悔匯會繪惠昏婚魂混活或貨獲禍霍',
  'J': '雞夾劑肌極金橘精蕉家加佳甲假架價嫁尖肩兼監堅簡檢剪減薦健艦漸踐江將疆講獎降椒焦角腳攪繳叫轎較皆接揭街節捷截竭姐解介戒屆界借巾今津僅緊謹進近晉浸禁京經驚晶井警景淨竟敬靜境鏡糾究九久酒舊救就舅居局舉矩巨拒具俱劇據距懼捐卷決絕覺軍君均菌俊郡',
  'K': '卡康抗考烤靠科棵客課肯啃空孔恐口扣庫跨快寬款框狂況葵奎魁饋昆捆困括擴',
  'L': '鹿柳藍鏈綠里鈴鱸拉辣來賴欄懶爛郎狼浪撈老姥酪樂勒雷累冷厘梨理李裡禮力歷立麗利例粒倆連聯臉練煉良梁糧兩亮諒量療料列烈獵裂林臨零領另令溜劉留流六龍隆壟籠樓漏露蘆爐陸錄路旅律慮率卵亂掠輪論羅邏落洛鋁',
  'M': '貓馬莓米目麻媽碼罵埋買賣麥脈蠻慢漫忙芒毛矛貌冒帽麼沒眉梅煤每美妹門們萌盟猛夢密蜜秘棉免勉面苗描秒妙廟滅民敏名明鳴模膜磨抹某母畝木牧墓幕蔓妙',
  'N': '牛南拿哪那納奶奈耐男難腦惱鬧呢內嫩能尼泥你擬逆年念娘釀鳥尿捏您寧凝扭紐農濃奴怒女暖虐挪諾',
  'O': '偶歐毆鷗',
  'P': '排皮片配蘋爬怕拍牌派判盼旁胖拋跑泡呸胚陪培賠佩噴盆朋棚蓬膨捧碰批批披疲脾匹屁偏篇騙飄漂票撇拼頻品聘乒瓶評憑坡潑婆迫破剖鋪僕普譜瀑',
  'Q': '籤旗鯖秋奇企千牽前錢強槍搶敲橋瞧巧悄切茄且親侵秦琴禽勤青輕氫傾清情晴請慶求球區屈驅渠取娶去趣圈全權泉拳缺卻確雀群裙',
  'R': '肉乳軟人仁忍刃認任日絨容溶融榮如儒入褥瑞潤若弱',
  'S': '沙山生濕薯虱鯊傻曬閃扇善傷商上梢稍少紹哨舌蛇設社申伸身深神審甚慎升聲牲省盛剩屍失師詩施獅十什石時實識食史使始室市式試事勢視適示世收手守首受授售獸書叔舒熟俗暑鼠屬術束述數樹刷耍衰摔甩帥栓雙爽誰水稅睡順瞬說絲司私思死四寺似飼鬆送宋搜訴速塑酸算雖隨歲碎孫損筍縮所鎖',
  'T': '貼脫鴕鮪他她它塔踏抬太態談彈糖躺燙桃逃套特疼騰梯踢提題體替天添田甜挑條跳鐵聽廷停挺艇通同銅統痛偷投透突圖徒塗土吐兔團推腿退吞豚托拖馱妥拓',
  'W': '物委外吻蛙娃瓦歪彎灣玩完晚碗萬汪王網往望忘危微唯維偉尾未味胃溫文聞穩問翁臥握屋無吳五午武舞勿務誤',
  'X': '鮮蝦香小蟹心鱈西吸希析稀息悉惜犧習席洗喜戲細瞎峽俠下夏嚇仙先纖賢咸顯險現獻縣限線相箱祥想響向項象像橡消銷曉孝效校笑些歇協邪鞋寫寫謝卸辛新信興星猩型形刑行醒姓性兄凶胸雄熊修羞徐許序敘緒續軒宣玄選薛學雪血尋巡詢循訓迅速',
  'Y': '羊鴨魚氧藥櫻椰薏樣葉越壓呀牙芽雅亞訝咽煙延嚴岩沿炎研言顏掩眼演厭宴驗雁焰央鴦洋陽楊養邀腰窯謠搖遙咬要耀耶爺野夜葉一伊衣醫依儀夷宜姨移遺疑乙已以矣椅億義藝意毅易益譯議疫役陰音銀引飲印英迎營影硬映喲擁庸永泳勇用優憂幽悠尤由郵猶油友有又右幼誘於余娛樂漁愉輿與宇羽雨語玉育郁遇預欲域譽裕元員園原源邊遠院願約月樂躍粵雲勻允孕運暈',
  'Z': '豬紙胗芝燥中資仔雜災栽載宰再在咱暫贊髒葬遭糟早藻造灶則責怎增贈渣札扎眨榨齋窄債沾粘斬展嶄占戰站湛章張掌丈仗帳脹障招找召照罩遮折哲者這蔗針偵珍真診枕陣振震鎮蒸整正證政症之支汁脂直值職植執指只旨紙志至致置稚智質終鐘腫種眾重舟周州粥軸肘咒宙晝皺朱珠諸竹燭主煮囑矚住助注著駐柱祝抓專磚轉撰賺莊裝壯撞追準桌琢昨左佐作坐座做'
};

const PINYIN_INITIALS: Record<string, string> = {};

// Build the lookup dictionary dynamically
for (const [initial, chars] of Object.entries(groups)) {
  for (const char of chars) {
    PINYIN_INITIALS[char] = initial;
  }
}

// Prioritized translation dictionary
const TRANSLATION_DICT: { chinese: string; english: string }[] = [
  // Animals / Meats
  { chinese: '雞肉', english: 'CHICKEN' },
  { chinese: '雞胸', english: 'CHICKEN' },
  { chinese: '雞里肌', english: 'CHICKEN' },
  { chinese: '雞腿', english: 'CHICKEN_LEG' },
  { chinese: '雞翅', english: 'CHICKEN_WING' },
  { chinese: '雞心', english: 'CHICKEN_HEART' },
  { chinese: '雞肝', english: 'CHICKEN_LIVER' },
  { chinese: '雞胗', english: 'CHICKEN_GIZZARD' },
  { chinese: '雞', english: 'CHICKEN' },

  { chinese: '牛肉', english: 'BEEF' },
  { chinese: '牛腱', english: 'BEEF' },
  { chinese: '牛腱肉', english: 'BEEF' },
  { chinese: '牛排', english: 'BEEF_STEAK' },
  { chinese: '牛筋', english: 'BEEF_TENDON' },
  { chinese: '牛肝', english: 'BEEF_LIVER' },
  { chinese: '牛心', english: 'BEEF_HEART' },
  { chinese: '牛', english: 'BEEF' },

  { chinese: '豬肉', english: 'PORK' },
  { chinese: '豬里肌', english: 'PORK' },
  { chinese: '豬心', english: 'PORK_HEART' },
  { chinese: '豬肝', english: 'PORK_LIVER' },
  { chinese: '豬耳', english: 'PORK_EAR' },
  { chinese: '豬', english: 'PORK' },

  { chinese: '羊肉', english: 'LAMB' },
  { chinese: '羊排', english: 'LAMB' },
  { chinese: '羊', english: 'LAMB' },

  { chinese: '鴨肉', english: 'DUCK' },
  { chinese: '鴨胸', english: 'DUCK' },
  { chinese: '鴨心', english: 'DUCK_HEART' },
  { chinese: '鴨肝', english: 'DUCK_LIVER' },
  { chinese: '鴨胗', english: 'DUCK_GIZZARD' },
  { chinese: '鴨', english: 'DUCK' },

  { chinese: '鹿肉', english: 'VENISON' },
  { chinese: '鹿', english: 'VENISON' },

  { chinese: '兔肉', english: 'RABBIT' },
  { chinese: '兔', english: 'RABBIT' },

  { chinese: '火雞肉', english: 'TURKEY' },
  { chinese: '火雞', english: 'TURKEY' },
  { chinese: '鴕鳥肉', english: 'OSTRICH' },
  { chinese: '鴕鳥', english: 'OSTRICH' },
  { chinese: '鵪鶉肉', english: 'QUAIL' },
  { chinese: '鵪鶉', english: 'QUAIL' },

  // Seafood
  { chinese: '鮭魚', english: 'SALMON' },
  { chinese: '鱈魚', english: 'COD' },
  { chinese: '鮪魚', english: 'TUNA' },
  { chinese: '虱目魚', english: 'MILKFISH' },
  { chinese: '旗魚', english: 'SWORDFISH' },
  { chinese: '鱸魚', english: 'BASS' },
  { chinese: '鯖魚', english: 'MACKEREL' },
  { chinese: '丁香魚', english: 'ANCHOVY' },
  { chinese: '柳葉魚', english: 'CAPELIN' },
  { chinese: '秋刀魚', english: 'SAURY' },
  { chinese: '吻仔魚', english: 'WHITEBAIT' },
  { chinese: '鯊魚軟骨', english: 'SHARK_CARTILAGE' },
  { chinese: '鯊魚', english: 'SHARK' },
  { chinese: '干貝', english: 'SCALLOP' },
  { chinese: '蝦仁', english: 'SHRIMP' },
  { chinese: '蝦子', english: 'SHRIMP' },
  { chinese: '蝦', english: 'SHRIMP' },
  { chinese: '鱉蛋粉', english: 'TURTLE_EGG' },
  { chinese: '鱉蛋', english: 'TURTLE_EGG' },
  { chinese: '鱉', english: 'TURTLE' },

  // Vegetables / Fruits
  { chinese: '南瓜', english: 'PUMPKIN' },
  { chinese: '地瓜', english: 'SWEET_POTATO' },
  { chinese: '番薯', english: 'SWEET_POTATO' },
  { chinese: '紅薯', english: 'SWEET_POTATO' },
  { chinese: '馬鈴薯', english: 'POTATO' },
  { chinese: '土豆', english: 'POTATO' },
  { chinese: '山藥', english: 'YAM' },
  { chinese: '薏仁', english: 'COIX' },
  { chinese: '芝麻', english: 'SESAME' },
  { chinese: '蘋果', english: 'APPLE' },
  { chinese: '香蕉', english: 'BANANA' },
  { chinese: '藍莓', english: 'BLUEBERRY' },
  { chinese: '蔓越莓', english: 'CRANBERRY' },
  { chinese: '椰子', english: 'COCONUT' },

  // Herbs / Extras
  { chinese: '貓草', english: 'CATGRASS' },
  { chinese: '貓薄荷', english: 'CATNIP' },
  { chinese: '軟骨', english: 'CARTILAGE' },
  { chinese: '心臟', english: 'HEART' },
  { chinese: '肝臟', english: 'LIVER' },
  { chinese: '胗', english: 'GIZZARD' },

  // Types / States
  { chinese: '凍乾', english: 'DRY' },
  { chinese: '烘乾', english: 'DRY' },
  { chinese: '乾肉', english: 'DRY' },
  { chinese: '乾', english: 'DRY' },
  { chinese: '生鮮', english: 'WET' },
  { chinese: '生肉', english: 'WET' },
  { chinese: '濕', english: 'WET' },
  { chinese: '生', english: 'WET' },
  { chinese: '夾鏈袋', english: 'BAG' },
  { chinese: '鋁箔袋', english: 'BAG' },
  { chinese: '包裝', english: 'PKG' },
  { chinese: '袋', english: 'BAG' },
  { chinese: '包材', english: 'BAG' },
  { chinese: '貼紙', english: 'STICK' },
  { chinese: '標籤', english: 'STICK' },
  { chinese: '貼', english: 'STICK' },
  { chinese: '乾燥劑', english: 'DESI' },
  { chinese: '脫氧劑', english: 'OXY' },
  { chinese: '耗材', english: 'CONSUMABLE' },
  { chinese: '半成品', english: 'SEMI' },

  // Sizes / Specs
  { chinese: '大包', english: 'L' },
  { chinese: '大袋', english: 'L' },
  { chinese: '中包', english: 'M' },
  { chinese: '中袋', english: 'M' },
  { chinese: '小包', english: 'S' },
  { chinese: '小袋', english: 'S' },
  { chinese: '試吃包', english: 'SAMPLE' },
  { chinese: '試吃', english: 'SAMPLE' },
  { chinese: '隨手包', english: 'SAMPLE' },
  { chinese: '隨手', english: 'SAMPLE' },
  { chinese: '樣品', english: 'SAMPLE' },
];

/**
 * Translates Chinese characters or matches dictionary terms to English fragments.
 */
export function translateChineseName(name: string): string[] {
  let tempName = name;
  const matches: string[] = [];

  // Match words from translation dictionary
  for (const item of TRANSLATION_DICT) {
    if (tempName.includes(item.chinese)) {
      matches.push(item.english);
      tempName = tempName.replace(new RegExp(item.chinese, 'g'), '');
    }
  }

  // Clean special characters and whitespace, leaving only letters, numbers, and Chinese characters
  tempName = tempName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');

  if (tempName.length > 0) {
    let initials = '';
    for (const char of tempName) {
      if (PINYIN_INITIALS[char]) {
        initials += PINYIN_INITIALS[char];
      } else if (/[a-zA-Z0-9]/.test(char)) {
        initials += char.toUpperCase();
      }
    }
    if (initials) {
      matches.push(initials);
    }
  }

  return matches;
}

/**
 * Generates a standard product ID (e.g. PROD_BEEF_L) based on Chinese name and specification.
 */
export function generateProductId(name: string, skuSpec: string): string {
  if (!name.trim()) return 'PROD_';
  
  const namePieces = translateChineseName(name);
  const specPieces = translateChineseName(skuSpec);
  const combined = [...namePieces, ...specPieces];

  // Filter out DRY, WET, SEMI since they are redundant in final product retail SKU IDs
  const filtered = combined.filter(p => p !== 'DRY' && p !== 'WET' && p !== 'SEMI');

  const sizes = ['L', 'M', 'S', 'SAMPLE'];
  const sizePart = filtered.find(p => sizes.includes(p));
  const otherParts = filtered.filter(p => !sizes.includes(p));

  let result = 'PROD_';
  if (otherParts.length > 0) {
    result += otherParts.join('_');
  }
  if (sizePart) {
    // Avoid double underscores if there are other parts
    result += (otherParts.length > 0 ? '_' : '') + sizePart;
  }

  return result.toUpperCase();
}

/**
 * Generates a standard material ID (e.g. MAT_DRY_PUMPKIN) based on Chinese name, material type, and category.
 */
export function generateMaterialId(name: string, type: 'RAW_DRY' | 'RAW_WET' | 'CONSUMABLE', category: string): string {
  if (!name.trim()) {
    if (type === 'RAW_WET') return 'MAT_WET_';
    if (type === 'RAW_DRY') return 'MAT_DRY_';
    return 'MAT_';
  }

  const pieces = translateChineseName(name);

  let prefix = 'MAT_';
  if (type === 'RAW_WET') {
    prefix = 'MAT_WET_';
  } else if (type === 'RAW_DRY') {
    prefix = 'MAT_DRY_';
  }

  // Filter out redudant type indicators in the name segments to keep the ID clean
  const filteredPieces = pieces.filter(p => p !== 'WET' && p !== 'DRY' && p !== 'SEMI');

  if (filteredPieces.length > 0) {
    return (prefix + filteredPieces.join('_')).toUpperCase();
  }

  return prefix.toUpperCase();
}
