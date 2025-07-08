const codeArea = document.getElementById("code-area");
const code = document.getElementById("code");
const terminal = document.getElementById("terminal");
const runArea = document.getElementById("run");
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
// 코드 작성 -> 실행 버튼 -> 결과 html 창 -> if press close: return code_page
// text->line->"와 로 분리 -> AbstructCommand ("str"", "~"), ("int", "1234"), ("var", "n"), ("func", "print"), ("LPAR", "("), ("RPAR", ")"), ("start", "{"), ("end", "}")
//                                                                       is alpha.            ()여부
// 키워드 하나씩 제거해가면서 실행하는 방법 (키워드: 변수, 물체, )

// var = {"n":"value", .......}, func = {"custom":[(tokens)], ....}

// while tokens: tokens.popleft() -> token
// if token.type == "start" -> local_stack += ++token.value > while token.type == "end". if not "end" -> raise "'}' is not exist ERROR"
// if token.type == "LPAR" -> temp_stack += ++token.value > while token.type == "RPAR". if not "RPAR" -> raise "')' is not exist ERROR"
// if token.type == "var" -> var[token.value]
// if token.type == "func" -> tokens.insert(current_pos, func[token.value])
/*
Type = 숫자, 문자, 불리언
system = 배열, 변수, 함수
출력 내용 -> "ㅁㅇㄹㅁㄴㅇㄹ ㅁㄴㅇㄹ", 100, 변수명
입력 변수명
변수 변수명[] = 값

상수 리터럴:
문자열: "집가고싶다"
숫자: 100, 100.0
배열: [블람ㅇ니라ㅓㅁㄴ아ㅣ러, ㅁㄴㅇㄹㅁㄴㅇㄹㅁㄴㅇㄹㅁ]

인식 가능한 값:
모든 상수 리타럴, 변수명

변수 변수명 = "
*/
class Token {
  constructor(type, value) {
    this.type = type
    this.value = value
  }
}

function error(data) {
  console.log("Error: " + data);
}

function separate_type(valueStr) {
  let tokens = [];
  if (typeof valueStr === "string") {
    tokens = valueStr.match(/"(?:[^"\\]|\\.)*"|\d+|\w+|==|>=|<=|[%()+\-*/=><!]|참|거짓|ture|false/g);
    console.log("string:", tokens);
  }else {
    tokens = valueStr
    console.log("not:", tokens);
  }
  if (tokens===null) tokens = [valueStr];
  console.log('tokens', tokens);
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
      if (val.type === "str") val.value = `"${val.value}"`;
      result.push(...separate_type(val.value));
    } else if (token in object_data) {
      result.push(new Token("object", object_data[token]));
    }else {
      error(`예기치 못한 토큰 "${token}"`);
    }
  }
  return result;
}

function AbstractCommand(line) {
  if (line.trim()==="끝") {
    end();
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
  console.log("함수 시작", datas);
  const tokens = separate_type(datas);
  console.log("토큰 성공", tokens);
  const parser = createParser(tokens);
  console.log("파서 만들기 성공", parser);
  const temp = parser.parse();
  console.log("파서 성공", temp);
  const result = evaluate(temp);
  console.log("계산 성공", result);
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
    while (current < tokens.length && tokens[current].type === 'oper' && (tokens[current].value === '+' || tokens[current].value === '-')) {
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
    if (right.type === 'num') right = Number(right.value);
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
  alert(calculate_data(data).value);
}

// function changeType_strAint(data) {
//   const firstSpace = data.indexOf(" ");
//   const target = data.slice(0, firstSpace).trim();
//   if (variable_data.includes(target)) {
//     const next_type = data.slice(firstSpace+1).trim();
//     const current_type = separate_type(target);
//     if (current_type=="str" && next_type=="int" && isNaN(variable_data[target])) {
//       variable_data[target] = Token(next_type, target);
//     }else if (current_type=="int" && next_type=="str") {
//       variable_data[target] = Token(next_type, variable_data[target]);
//     }
//   }
// }

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
    if (!(parts.length >= 3 || (parts.length === 2 && parts[1] === "제거"))) {
      error(`올바르지 않은 형식 "${data}"`);
      return;
    }
    let rest;
    [this.name, this.func, ...rest] = parts;
    rest = (rest.join(" ")).split(",");
    this.value = rest.map(v => calculate_data(v));
    console.log(this.value);
    this.func_type();
  }

  func_type() {
    if (this.func==="크기") this.size();
    else if (this.func==="이동") this.move();
    else if (this.func=="제거") this.remove();
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


function run() {
  if (is_running) return;
  is_running = true;
  let lines = code.value.split("\n");
  depth = 0;
  pos = 0;
  variable_data = {}
  function_data = {}
  object_data = {}
  local_stack = []
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
      AbstractCommand(lines[pos++]);
    }
  }
  is_running = false;
}
function stop() {
  is_stop = true;
}