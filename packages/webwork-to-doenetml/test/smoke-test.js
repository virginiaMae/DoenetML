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

// Matching: a table of labeled graphs, with shading, and a select list
output = convert(String.raw`DOCUMENT();
$c = random(2,4,1);
$graph1 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$graph2 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$p1 = FEQ("-x+$c for x in <-8,8> using color:blue weight:2 line:dashed");
$p2 = FEQ("4 for x in <-8,2> using color:blue weight:2");
$graph2->moveTo(2,4);
$graph2->lineTo(2,8,'blue',2);
plot_functions($graph1,$p1);
plot_functions($graph2,$p2);
$graph1->fillRegion([0,0,'green']);
$graph2->fillRegion([0,5,'green']);
@ops = (separation=>30, indent=>0);
$imageTable =
  BeginTable().
    Row([image(insertGraph($graph1),width=>300),image(insertGraph($graph2),width=>300)],@ops).
    AlignedRow([bold('A'),bold('B')],@ops).
  EndTable();
$sl = new_select_list();
$sl->{separation} = 10;
$sl->qa(
  "\(x+y < $c\)", "A",
  "\(x \le 2\) and \(y \ge 4\;\)", "B"
);
$sl->choose(2);
BEGIN_TEXT
Match the inequalities with the graphs.
$PAR $imageTable $PAR
\{$sl->print_q\}
END_TEXT
ANS(str_cmp($sl->ra_correct_ans));
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unrecognized|Not converted|answer blanks/);
assert.match(
    output,
    /<function name="p1" domain="\[-8,8\]" stylenumber="1" lineStyle="dashed">-x\+\$c<\/function>/,
);
assert.match(
    output,
    /<function name="graph1Edge">0 \+ 8 sign\(0 - \$\$p1\(0\)\)<\/function>/,
);
assert.match(
    output,
    /<sideBySide>\s*<figure suppressFigureNameInCaption>\s*<graph[^>]*>\s*<shortDescription>Graph A<\/shortDescription>\s*\$p1\s*<regionBetweenCurves boundaryValues="-8 8">\$p1 \$graph1Edge<\/regionBetweenCurves>\s*<\/graph>\s*<caption>A<\/caption>/,
);
assert.match(
    output,
    /<lineSegment endpoints="\(2,4\) \(2,8\)"\/>\s*\$p2\s*<regionBetweenCurves boundaryValues="-8 2">/,
);
assert.match(
    output,
    /<ol>\s*<shuffle>\s*<li><answer inline name="ans1"><label><m>x\+y < \$c<\/m><\/label><choice credit="1">A<\/choice><choice>B<\/choice><\/answer><\/li>/,
);
assert.match(
    output,
    /<label><m>x \\le 2<\/m> and <m>y \\ge 4\\;<\/m><\/label>/,
);
assert.match(output, /<givenAnswer>\s*<p><m>x\+y < \$c<\/m>: A<\/p>/);
assert.doesNotMatch(output, /<p>\s*<sideBySide|<p>\s*<ol/);

// A select list showing only some of its questions
output = convert(String.raw`DOCUMENT();
$sl = new_select_list();
$sl->qa("\(1=1\)", "T", "\(1=2\)", "F", "\(2=2\)", "T");
$sl->choose(2);
BEGIN_TEXT
\{$sl->print_q\}
END_TEXT
ANS(str_cmp($sl->ra_correct_ans));
ENDDOCUMENT();`);

assert.match(
    output,
    /<select numToSelect="2">\s*<option><li><answer inline name="ans1"><label><m>1=1<\/m><\/label><choice>F<\/choice><choice credit="1">T<\/choice><\/answer><\/li><\/option>/,
);
assert.doesNotMatch(output, /<givenAnswer>/);

// Pop-up menus, including one whose answer depends on an if block
output = convert(String.raw`DOCUMENT();
$a = random(1,2,1);
if ($a==1){
$popup1 = PopUp(['?','Yes','No'],'Yes');
}
if ($a==2){
$popup1 = PopUp(['?','Yes','No'],'No');
}
$popup2 = PopUp(['?','Yes','No'],'No');
BEGIN_TEXT
\{$popup1->menu\} Is it a function?
$PAR
\{$popup2->menu\} Is it one-to-one?
END_TEXT
ANS($popup1->cmp);
ANS($popup2->cmp);
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unrecognized|answer blanks/);
assert.match(
    output,
    /<answer inline name="ans1"><shortDescription>Is it a function\?<\/shortDescription><choiceInput inline name="ans1Input"><choice>Yes<\/choice><choice>No<\/choice><\/choiceInput><award><when>\(\$a=1 and \$ans1Input\.selectedIndices = 1\) or \(\$a=2 and \$ans1Input\.selectedIndices = 2\)<\/when><\/award><\/answer>/,
);
assert.match(
    output,
    /<answer inline name="ans2"><shortDescription>Is it one-to-one\?<\/shortDescription><choice>Yes<\/choice><choice credit="1">No<\/choice><\/answer>/,
);
assert.match(
    output,
    /<conditionalContent><case condition="\$a=1"><p>Is it a function\?: Yes<\/p><\/case>/,
);

console.log("webwork-to-doenetml smoke test passed");
