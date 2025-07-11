const codeArea = document.getElementById("code-area");
const code = document.getElementById("code");
const terminal = document.getElementById("terminal");
const terminal_bar = document.getElementById("terminal-bar");
const runArea = document.getElementById("run");
const topHandle = document.getElementById("top-handle");
const middleArea = document.getElementById("middle-area");
const circle = document.getElementById("circle");
const terminal_top = document.getElementById("terminal-bar-top");
let pos = 0;
let start_pos = 0;
let variable_data = {};
let function_data = {};
let object_data = {};
let local_stack = []; //[{~~}, {~~~}, {~~}]
let depth = 0;
let is_stop = false;
let is_running = false;
let skip = false;
let isDragging = false;
let drag_terminal = false;

topHandle.addEventListener("mousedown", () => {
  drag_terminal = false;
  isDragging = true;
  document.body.style.userSelect = "none"; // 드래그시 텍스트 선택 방지
});

terminal_top.addEventListener("mousedown", () => {
  drag_terminal = true;
  isDragging = true;
  document.body.style.userSelect = "none";
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  document.body.style.userSelect = "auto";
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const middleRect = middleArea.getBoundingClientRect();
  if (drag_terminal) {
    const minHeight = 100;
    const maxHeight = window.innerHeight - minHeight;

    let newCodeHeight = e.clientY - middleRect.top;
    const newTerminalHeight = window.innerHeight - newCodeHeight - topHandle.offsetHeight - document.getElementById("top-bar").offsetHeight - terminal_top.offsetHeight;

    newCodeHeight = Math.max(minHeight, Math.min(newCodeHeight, maxHeight));

    middleArea.style.height = `${newCodeHeight}px`;
    terminal_bar.style.height = `${newTerminalHeight}px`;
  }else {
    const minWidth = 100; // 최소 너비 제한
    const maxWidth = middleRect.width - minWidth;

    let newCodeWidth = e.clientX - middleRect.left;

    // 최소/최대값 클램핑
    newCodeWidth = Math.max(minWidth, Math.min(newCodeWidth, maxWidth));

    // flex-basis(px)로 크기 지정
    codeArea.style.flex = `0 0 ${newCodeWidth}px`;
    circle.style.left = `${newCodeWidth}px`;
    runArea.style.flex = `1 1 auto`; // run은 나머지 공간 차지"
  }
});

// 작동코드
class Token {
  constructor(type, value) {
    this.type = type
    this.value = value
  }
}

function error(data) {
  terminal.innerHTML += `<p style="color:red;">Error: ${data}</p>`;
  console.log(`Error: ${data}`);
}

function separate_type(valueStr) {
  let tokens = [];
  if (typeof valueStr === "string") {
    tokens = valueStr.match(/"(?:[^"\\]|\\.)*"|[-+]?\d+|!=|==|>=|<=|[%()+\-*/=><!]|참|거짓|ture|false|[\w가-힣]+/g);
  }else {
    tokens = valueStr
  }
  if (tokens===null) tokens = [valueStr];
  const result = [];
  for (let token of tokens) {
    if (!isNaN(token)) {
      result.push(new Token("num", token));
    } else if (token === "참" || token === "거짓" || token === "true" | token === "false") {
      result.push(new Token("bool", token));
    } else if (token.startsWith('"') && token.endsWith('"')) {
      result.push(new Token("str", token.slice(1, -1)));
    } else if (token.match(/"(?:[^"\\]|\\.)*"|<=|>=|==|!=|[%+\-*/=><()]/g)) {
      result.push(new Token("oper", token));
    } else if (token in function_data) {
      result.push(new Token("func", token)); // 함수명
    } else if (token in variable_data) {
      let val = variable_data[token];
      if (!(val instanceof Token)) {
        if (!isNaN(val)) val = new Token("num", val);
        else if (val === "참" || val === "거짓" || val === "true" | val === "false") val = new Token("bool", val);
        else val = new Token("str", String(val));
      }
      if (val.type === "str") val.value = val.value.startsWith('"')?val.value:`"${val.value}"`;
      result.push(...separate_type(val.value));
    } else if (token in object_data) {
      result.push(new Token("object", object_data[token]));
    }else {
      error(`예기치 못한 토큰 "${token}"`);
    }
  }
  return result;
}

function wait(ms) {
  return new Promise((resolve => {
    setTimeout(() => {
      resolve();
    }, ms)
  }));
}

async function AbstractCommand(line) {
  if (line.trim() == "") return;
  if (line.trim()==="끝") {
    end();
    return;
  }else if (line.trim()==="도움") {
    help();
    return;
  }else if (line.trim()==="다음") {
    next_line();
    return;
  }
  const firstSpace = line.indexOf(" ");
  const firstEqual = line.indexOf("=");
  let command = line.slice(0, firstSpace).trim();
  let name = null;
  if (firstSpace===-1) {
    if (firstEqual===-1) {
      error(`"${line}" 기본형식은 키워드로 시작합니다!\n키워드는 띄어쓰기로 구분!`);
      return;
    }else name = line.slice(0, firstEqual).trim();
  }
  if (firstEqual!==-1) name = line.slice(0, firstEqual).trim();
  const value = line.slice(firstSpace+1).trim();
  if (command == "변수") variable(value);
  else if (command == "입력") input(value);
  else if (command == "출력") print(value);
  // else if (command=="변환") changeType_strAint(value);
  else if (command == "조건") control(value, "condition");
  else if (command == "반복") control(value, "repeat");
  else if (command == "물체") create_object(value);
  else if (command == "정지") await wait(value);
  else if (command in object_data) new object(line);
  else if (name && name in variable_data) variable(line);
  // 명령 종류: 변수 선언, 더하가, 연산, 이프
}

function variable(value) {
  const [name, ...values] = value.split("=");
  if ((values.length-1) % 2 == 1) error("do you mean \"==\"?");
  else {
    const datas = values.join("=").trim();
    const result = calculate_data(datas);
    make_var(name.trim(), result.value, result.type);
  }
}

function calculate_data(datas) {
  const tokens = separate_type(datas);
  const parser = createParser(tokens);
  const temp = parser.parse();
  const result = evaluate(temp);
  return result;
}

function createParser(tokens) {
  let current = 0;

  const parseComparison = () => {
    let left = parseExpression();
    while (current < tokens.length && tokens[current].type == 'oper' && ['>', '<', '>=', '<=', '==', '!='].includes(tokens[current].value)) {
      const op = tokens[current++].value;
      left = { type: 'BinaryOp', op, left, right: parseExpression() };
      }
    return left;
    };

  const parseExpression = () => {
    let left = parseTerm();
    while (current < tokens.length && tokens[current].type === 'oper' && (['+', '-'].includes(tokens[current].value))) {
      const op = tokens[current++].value;
      left = { type: 'BinaryOp', op, left, right: parseTerm() };
    }
    return left;
  };

  const parseTerm = () => {
    let left = parseFactor();
    while (current < tokens.length && tokens[current].type === 'oper' && ['*', '/', '%'].includes(tokens[current].value)) {
      const op = tokens[current++].value;
      left = { type: 'BinaryOp', op, left, right: parseFactor() };
    }
    return left;
  };

  const parseFactor = () => {
    if (current < tokens.length && tokens[current].type === 'oper' && tokens[current].value === '(') {
      current++;
      const expr = parseExpression();
      if (
        current >= tokens.length ||
        tokens[current].type !== 'oper' ||
        tokens[current].value !== ')'
      ) {
        error('닫기 괄호가 없습니다.');
      }
      current++;
      return expr;
    }

    if (tokens[current]?.type === 'num') return { type: 'num', value: tokens[current++].value };
    if (tokens[current]?.type === 'str') return { type: 'str', value: tokens[current++].value };
    if (tokens[current]?.type === 'bool') return { type: 'bool', value: tokens[current++].value };
    if (tokens[current]?.type === 'object') return { type: 'object', value: tokens[current++].value };

    error(`알 수 없는 토큰: ${JSON.stringify(tokens[current])}`);
    }

    return {
      parse: () => parseComparison()
    };
}

function evaluate(node) {
  if (["num", "str", "bool", "object"].includes(node.type)) {
    return node;
  }else if (node.type === "BinaryOp") {
    let left = evaluate(node.left);
    let right = evaluate(node.right);

    if (left.type === 'num') left = Number(left.value);
    else if (left.type === 'bool') left = Boolean(left.value);
    else left = left.value;

    if (right.type === 'num') right = Number(right.value);
    else if (right.type === 'bool') right = Boolean(left.value);
    else right = right.value;

    switch (node.op) {
      case "+": return new Token("num", String(left + right));
      case "-": return new Token("num", String(left - right));
      case "*": return new Token("num", String(left * right));
      case "/": return new Token("num", String(left / right));
      case "%": return new Token("num", String(left % right));
      case "==": return new Token("bool", String(left == right));
      case ">": return new Token("bool", String(left > right));
      case "<": return new Token("bool", String(left < right));
      case ">=": return new Token("bool", String(left >= right));
      case "<=": return new Token("bool", String(left <= right));
      case "!=": return new Token("bool", String(left != right));
      case "&": return new Token("num", String(left&right));
      case "|": return new Token("num", String(left|right));
      case "^": return new Token("num", String(left^right));
      default:
        error("정체불명의 연산자: " + node.op);
    }
  } else {
    error("알 수 없는 자료형: " + node.type);
  }
}

function input(data) {
  const firstSpace = data.indexOf(" ");
  if (firstSpace==-1) {
    make_var(data, prompt(), "str");
  }else {
    const name = data.slice(0, firstSpace).trim();
    const value = data.slice(firstSpace + 1).trim();
    const description = calculate_data(value).value;
    const answer = prompt(description);
    make_var(name, answer, "str");
  }
}

function make_var(name, value, type) {
  variable_data[name] = new Token(type, value);
}

function print(data) {
  terminal.innerText += calculate_data(data).value;
}

function next_line() {
  terminal.innerText += "\n";
}

function create_object(value) {
  const [name, type] = value.trim().split(/\s+/);
  if (!type) {
    error('형식은 "물체 물체명 HTML태그"이여야 합니다.');
  }else {
    const tempElement = document.createElement(type);
    if (tempElement instanceof HTMLUnknownElement) {
      error(`"${type}"은 유요한 HTML태그가 아닙니다.`);
      return;
    }
    if (name in object_data) {
      error(`${name}은 이미 존재하는 물체입니다.`)
      return;
    }
    object_data[name] = tempElement;
    tempElement.style.position = "absolute";
    tempElement.style.left = "0px";
    tempElement.style.top = "0px";
    runArea.appendChild(tempElement);
  }
}

class object {
  constructor(data) {
    const parts = data.trim().split(/\s+/);
    if (!(parts.length >= 3 || (parts.length === 2 && (parts[1] === "제거" || parts[1] === "색상")))) {
      error(`올바르지 않은 형식 "${data}"`);
      return;
    }
    let rest;
    [this.name, this.func, ...rest] = parts;
    rest = (rest.join(" ")).split(",");
    if (this.func === "색상") this.value = rest;
    else this.value = rest.map(v => calculate_data(v));
    this.func_type();
  }

  func_type() {
    if (this.func==="크기") this.size();
    else if (this.func==="이동") this.move();
    else if (this.func==="제거") this.remove();
    else if (this.func==="색상") this.color();
  }

  color() {
    if (this.value.length > 1) {
      error(`"${this.value}" 올바르지 않는 문법!`);
      return;
    }
    let [color] = this.value;
    let temp = color;
    if (temp==="빨강") temp = "red";
    else if (temp==="주황") temp = "orange";
    else if (temp==="노랑") temp = "yellow";
    else if (temp==="연두") temp = "yellowgreen";
    else if (temp==="초록") temp = "green";
    else if (temp==="하늘") temp = "skyblue";
    else if (temp==="파랑") temp = "blue";
    else if (temp==="남") temp = "navy";
    else if (temp==="보라") temp = "purple";
    else if (temp==="갈색") temp = "brown";
    else if (temp==="검정") temp = "black";
    else if (temp==="하양") temp = "white";
    else if (temp==="핑크") temp = "pink";
    object_data[this.name].style.backgroundColor = temp;
  }

  size() {
    let [w, h] = this.value;
    let target = object_data[this.name];
    if (!isNaN(h.value)) h.value+="px"; 
    if (!isNaN(w.value)) w.value+= "px";
    target.style.height = h.value;
    target.style.width = w.value;
  }

  move() {
    let [x, y] = this.value
    let target = object_data[this.name];
    x.value = String(parseInt(target.style.left)+Number(x.value))+"px";
    y.value = String(parseInt(target.style.top)+Number(y.value))+"px";
    target.style.left = x.value;
    target.style.top = y.value;
  }

  remove() {
    runArea.removeChild(object_data[this.name]);
    delete object_data[this.name];
  }
}

function control(value, type) {
  const result = calculate_data(value);
  if (result.type === 'bool' && (result.value === "거짓" || result.value === "false") || result.type !== 'bool') {
    skip = true;
    depth = 1;
    local_stack.push(new Token(`${type}F`, pos-1))
  }else local_stack.push(new Token(`${type}T`, pos-1));
}

function end() {
  const data = local_stack.pop();
  if (data.type === "repeatT") pos = data.value;
}

async function run() {
  if (is_running) return;
  is_running = true;
  let lines = code.value.split("\n");
  depth = 0;
  pos = 0;
  variable_data = {}
  function_data = {}
  object_data = {}
  local_stack = []
  runArea.innerHTML = '';
  terminal.innerHTML = '';
  skip = false;
  start_pos = 0;
  is_stop = false;
  while (!is_stop && pos < lines.length) {
    if (skip && depth!=0) {
      if (lines[pos].trim()=="끝") depth--;
      else {
        const command = lines[pos].trim().split(/\s+/)[0];
        if (command=="조건"||command=="반복") depth++;
      } 
      if (depth==0) skip = false;
      else pos++;
    }else {
      await AbstractCommand(lines[pos++]);
    }
  }
  is_running = false;
}
function stop() {
  is_stop = true;
}

function help() {
  terminal.innerText = "도움 -> 문법 설명\n변수 변수명 = 값 -> 변수에 값 저장[선언] (변수 = 값)\n조건 조건문 -다음 줄:내용들, 마지막 줄:'끝'\n반복 조건문 -다음 줄:내용들, 마지막 줄:'끝'\n물체 물체명 html태그 -> 오브젝트 생성\n물체명 [크기 가로,세로 -> 크기변경 / 색상 색깔 -> 색 변경 / 이동 x,y -> 현재 위치에서 x,y만큼 움직임 / 삭제 -> 그 물체 제거]\n입력 변수명 설명(값) -> 설명이 적힌 프롬프트가 올라오고, 입력한 그 값이 지정변수에 저장\n출력 내용 -> 내용을 터미널에 출력\n다음 -> 터미널에 줄바꿈\n정지 ms -> ms만큼 코드 수행 중지함.\n";
}