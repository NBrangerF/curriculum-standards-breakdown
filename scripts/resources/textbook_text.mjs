// The text layer of many 人教 PDFs (数学, 物理, 化学) writes Latin letters with a font whose codes land on rare
// Chinese characters: 狓 is x, 犃犅犆 are ABC, 点犗 is 点O. Read back as letters, so quotes match what the book shows.
const LETTERS = new Map([...'犪犫犮犱犲犳犵犺犻犼犽犾犿狀狅狆狇狉狊狋狌狏狑狓狔狕'].map((char, index) => [char, String.fromCharCode(97 + index)])
    .concat([...'犃犅犆犇犈犉犌犎犐犑犓犔犕犖犗犘犙犚犛犜犝犞犠犡犢犣'].map((char, index) => [char, String.fromCharCode(65 + index)])))

export const unscramble = text => String(text || '').replace(/[犃-狕]/gu, char => LETTERS.get(char) || char)
