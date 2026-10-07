import assert from "node:assert/strict";

import { convert } from "../convert.js";

// Basic TEXT problem
const sampleProblem = String.raw`DOCUMENT();
BEGIN_TEXT
Solve \{ ans_rule(10) \}
END_TEXT

$a = Compute("x^2");
ANS($a);
ENDDOCUMENT();`;

let output = convert(sampleProblem);

assert.match(output, /<problem><title \/>/);
assert.match(output, /<math name="a" simplify="full">x\^2<\/math>/);
assert.match(output, /<p>Solve <answer name="ans1">\$a<\/answer><\/p>/);
assert.match(output, /<givenAnswer>\s*<p><m>\$a<\/m><\/p>\s*<\/givenAnswer>/);
assert.match(output, /<\/problem>\n$/);

// Arrays indexed by a random variable become a <select>, and text before an
// answer blank becomes its label (from OPL, author RA Cruz)
const arrayProblem = String.raw`## DESCRIPTION
## Word problem
## ENDDESCRIPTION
## Author(RA Cruz)
DOCUMENT();
loadMacros("PGstandard.pl", "MathObjects.pl");
TEXT(beginproblem());
Context()->variables->are(h=>'Real',
                          r=>'Real',
                          V=>'Real');

$n = random(0,1,1);
@var = ("h", "\(r^2\)");
@answer = (Formula("(3V)/(pi*r^2)"), Formula("(3V)/(pi*h)"));

BEGIN_TEXT
Solve for $BITALIC $var[$n]$EITALIC: \[ V = \frac{1}{3}\pi r^2 h \]
$PAR
$var[$n] =  \{ans_rule(15) \}
END_TEXT

$ans = $answer[$n];
ANS($ans->cmp);
$showPartialCorrectAnswers = 1;
ENDDOCUMENT();`;

output = convert(arrayProblem);

assert.match(output, /Author: RA Cruz - WeBWorK OPL/);
assert.match(output, /About the problem: Word problem/);
assert.match(
    output,
    /<select name="s1">\s*<option>\s*<math name="var">h<\/math>\s*<math name="answer"[^>]*>\(3V\)\/\(pi\*r\^2\)<\/math>\s*<\/option>\s*<option>\s*<math name="var">r\^2<\/math>/,
);
assert.match(output, /<math name="ans">\$s1\.answer<\/math>/);
assert.match(output, /Solve for <em> \$s1\.var<\/em>/);
assert.match(
    output,
    /<answer name="ans1"><label><m>\$s1\.var = <\/m><\/label>\$ans<\/answer>/,
);
assert.match(output, /<p><m>\$s1\.var = \$ans<\/m><\/p>/);
assert.doesNotMatch(output, /Unrecognized|selectFromSequence|\[\$n\]/);

// Arrays that don't fit the pattern are left alone
output = convert(String.raw`DOCUMENT();
$n = random(1,2,1);
@var = ("a", "b");
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($var[$n]);
ENDDOCUMENT();`);

assert.match(output, /Unrecognized pattern: @var/);
assert.doesNotMatch(output, /<select /);

// PGML
output = convert(
    [
        "DOCUMENT();",
        `$a = Compute("2");`,
        `$b = Compute("3");`,
        "BEGIN_PGML",
        "[`x =`] [_]{$a} and [`y`] = [_]{$b}",
        "END_PGML",
        "ENDDOCUMENT();",
    ].join("\n"),
);

assert.match(
    output,
    /<answer name="ans1"><label><m>x = <\/m><\/label>\$a<\/answer> and <answer name="ans2"><label><m>y = <\/m><\/label>\$b<\/answer>/,
);

// Conditionals
output = convert(String.raw`DOCUMENT();
$a = random(1,5,1);
if ($a < 3) { $b = Compute("1"); } else { $b = Compute("2"); }
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($b);
ENDDOCUMENT();`);

assert.match(output, /<case condition="\$a < 3">1<\/case>/);
assert.match(output, /<else>2<\/else>/);

// Math: `<` gets a space so DoenetML doesn't read it as a tag; `&` in
// cases is left alone; aligned environments become <md>/<mrow>;
// TEXT(beginproblem) without parentheses is skipped
output = convert(String.raw`DOCUMENT();
TEXT(beginproblem);
$a = Compute("x<2");
BEGIN_TEXT
Where is \(f(x)<0\)? \[ f(x) = \begin{cases} x & x\le 0 \\ 2 & x>0 \end{cases} \]
\[ \begin{aligned} y &= 2x+1 \\ y &= 3 \end{aligned} \]
\begin{eqnarray*} a &=& b \nonumber \\ c &<& d \end{eqnarray*}
\{ ans_rule(10) \}
END_TEXT
ANS($a);
ENDDOCUMENT();`);

assert.match(output, /<math name="a" simplify="full">x< 2<\/math>/);
assert.match(output, /<m>f\(x\)< 0<\/m>/);
assert.match(
    output,
    /<me> f\(x\) = \\begin\{cases\} x & x\\le 0 \\\\ 2 & x>0 \\end\{cases\} <\/me>/,
);
assert.match(output, /<md><mrow>y &= 2x\+1<\/mrow><mrow>y &= 3<\/mrow><\/md>/);
assert.match(output, /<md><mrow>a &= b<\/mrow><mrow>c &< d<\/mrow><\/md>/);
assert.doesNotMatch(output, /Unrecognized/);

// Perl subroutines become a single warning each
output = convert(String.raw`DOCUMENT();
sub bold {return $BBOLD.join("",@_).$EBOLD}
$a = Compute("2");
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($a->cmp(checker => sub {
    my ( $correct, $student, $ansHash ) = @_;
    return $correct == $student;
}));
ENDDOCUMENT();`);

assert.match(output, /Not converted: Perl subroutine `bold`/);
assert.match(output, /Not converted: custom answer checker/);
assert.match(output, /<answer name="ans1">\$a<\/answer>/);
assert.doesNotMatch(output, /Unrecognized/);

console.log("webwork-to-doenetml smoke test passed");
