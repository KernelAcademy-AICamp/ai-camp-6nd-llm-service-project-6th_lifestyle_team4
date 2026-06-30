package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.Markdown

// --- Document model (mirrors the structure of /m/terms.html and /m/privacy.html). ---

sealed interface DocBlock {
    data class Para(val text: String) : DocBlock
    data class Ordered(val items: List<String>) : DocBlock
    data class Unordered(val items: List<String>) : DocBlock
    data class Sub(val heading: String) : DocBlock
    data class Table(val headers: List<String>, val rows: List<List<String>>) : DocBlock
}

data class DocSection(val heading: String, val blocks: List<DocBlock>)

data class LegalDoc(
    val barTitle: String,
    val docTitle: String,
    val effectiveDate: String,
    val intro: String,
    val sections: List<DocSection>,
    val footer: String,
)

@Composable
fun LegalScreen(doc: LegalDoc, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        ActivityTopBar(title = doc.barTitle, onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Box(modifier = Modifier.height(24.dp))
            Text(
                text = doc.docTitle,
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 26.sp,
                ),
                color = Espresso,
            )
            Box(modifier = Modifier.height(6.dp))
            Text(text = doc.effectiveDate, style = MaterialTheme.typography.bodySmall, color = Walnut)
            Box(modifier = Modifier.height(24.dp))
            Text(text = Markdown.bold(doc.intro), style = MaterialTheme.typography.bodyMedium, color = Roast)

            doc.sections.forEachIndexed { i, section ->
                SectionView(section, isFirst = i == 0)
            }

            Box(modifier = Modifier.height(28.dp))
            ActivityHairline()
            Box(modifier = Modifier.height(16.dp))
            Text(text = doc.footer, style = MaterialTheme.typography.bodySmall, color = Walnut)
            // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
            Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
        }
    }
}

@Composable
private fun SectionView(section: DocSection, isFirst: Boolean) {
    if (!isFirst) {
        Box(modifier = Modifier.height(24.dp))
        ActivityHairline()
        Box(modifier = Modifier.height(18.dp))
    } else {
        Box(modifier = Modifier.height(24.dp))
    }
    Text(
        text = section.heading,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        color = Espresso,
    )
    Box(modifier = Modifier.height(12.dp))
    section.blocks.forEach { block -> BlockView(block) }
}

@Composable
private fun BlockView(block: DocBlock) {
    when (block) {
        is DocBlock.Para -> {
            Text(text = Markdown.bold(block.text), style = MaterialTheme.typography.bodyMedium, color = Roast)
            Box(modifier = Modifier.height(12.dp))
        }
        is DocBlock.Ordered -> {
            block.items.forEachIndexed { i, item -> MarkerItem(marker = "${i + 1}.", text = item) }
            Box(modifier = Modifier.height(6.dp))
        }
        is DocBlock.Unordered -> {
            block.items.forEach { item -> MarkerItem(marker = "•", text = item) }
            Box(modifier = Modifier.height(6.dp))
        }
        is DocBlock.Sub -> {
            Box(modifier = Modifier.height(4.dp))
            Text(
                text = block.heading,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                color = Espresso,
            )
            Box(modifier = Modifier.height(8.dp))
        }
        is DocBlock.Table -> DocTable(block)
    }
}

@Composable
private fun MarkerItem(marker: String, text: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Text(
            text = marker,
            style = MaterialTheme.typography.bodyMedium,
            color = Roast,
            modifier = Modifier.width(22.dp),
        )
        Text(text = Markdown.bold(text), style = MaterialTheme.typography.bodyMedium, color = Roast)
    }
}

@Composable
private fun DocTable(table: DocBlock.Table) {
    // Column weights tuned for a 3-column 수탁/위탁/비고 layout; falls back evenly otherwise.
    val weights = if (table.headers.size == 3) listOf(1f, 1.4f, 1.2f) else List(table.headers.size) { 1f }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(0.5.dp, Latte)
            .padding(bottom = 4.dp),
    ) {
        TableRow(cells = table.headers, weights = weights, header = true)
        table.rows.forEach { row ->
            Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
            TableRow(cells = row, weights = weights, header = false)
        }
    }
    Box(modifier = Modifier.height(12.dp))
}

@Composable
private fun TableRow(cells: List<String>, weights: List<Float>, header: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (header) Modifier.background(Latte) else Modifier)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        cells.forEachIndexed { i, cell ->
            Text(
                text = cell,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontWeight = if (header) FontWeight.Bold else FontWeight.Normal,
                ),
                color = if (header) Espresso else Roast,
                modifier = Modifier.weight(weights.getOrElse(i) { 1f }),
            )
        }
    }
}

// --- Document content (transcribed from /m/terms.html · /m/privacy.html, 시행일 2026-05-29). ---

fun termsDoc() = LegalDoc(
    barTitle = "이용약관",
    docTitle = "Daily Script 이용약관",
    effectiveDate = "시행일: 2026년 5월 29일",
    intro = "본 약관은 **Daily Script**(이하 \"회사\")가 제공하는 모바일 웹·앱(PWA) 서비스 " +
        "**\"Daily Script — 오늘의 명대사\"**(이하 \"서비스\")의 이용과 관련하여, 회사와 이용자 간의 " +
        "권리·의무 및 책임사항을 규정함을 목적으로 합니다.",
    sections = listOf(
        DocSection(
            "제1조 (정의)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "**\"서비스\"**란 회사가 제공하는, 영화·드라마·연극·뮤지컬·오페라 등 창작물의 명대사를 카드 형태로 매일 제공하고 둘러보기·북마크 기능을 제공하는 일체의 서비스를 말합니다.",
                        "**\"이용자\"**란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.",
                        "**\"회원\"**이란 회원가입(이메일·비밀번호 또는 카카오·구글 등 소셜 계정)을 하여 계정을 보유한 자를 말합니다.",
                        "**\"카드\"**란 명대사, 해당 장면의 극본 발췌, 키워드, 작품 정보 등으로 구성된 콘텐츠 단위를 말합니다.",
                        "**\"콘텐츠\"**란 서비스 내에 게시·제공되는 카드, 텍스트, 이미지, 작품 정보 등 일체의 자료를 말합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제2조 (약관의 게시와 개정)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회사는 본 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 내 화면에 게시합니다.",
                        "회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.",
                        "약관을 개정할 경우 적용일자 및 개정사유를 명시하여 적용일자 7일 전부터(이용자에게 불리하거나 중대한 변경의 경우 30일 전부터) 서비스 내에 공지합니다.",
                        "이용자가 개정약관 적용일까지 거부 의사를 표시하지 않고 서비스를 계속 이용하는 경우 개정약관에 동의한 것으로 봅니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제3조 (이용계약의 체결)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "이용계약은 이용자가 본 약관에 동의하고 회원가입을 신청한 후 회사가 이를 승낙함으로써 체결됩니다.",
                        "회사는 타인 정보 도용·허위 기재, 만 14세 미만 아동의 법정대리인 동의 없는 신청, 이전 약관 위반으로 자격을 상실한 경우 등에는 승낙을 하지 않거나 사후에 이용계약을 해지할 수 있습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제4조 (만 14세 미만 아동 등)",
            listOf(
                DocBlock.Para(
                    "본 서비스는 원칙적으로 만 14세 이상의 이용자를 대상으로 합니다. 만 14세 미만 아동은 법정대리인의 동의를 받아야 하며, 회사는 관련 법령에 따라 이를 처리합니다.",
                ),
            ),
        ),
        DocSection(
            "제5조 (회원 계정 및 관리)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회원은 이메일·비밀번호 또는 카카오·구글 등 소셜 계정을 통해 로그인할 수 있습니다.",
                        "회원은 자신의 계정·비밀번호를 직접 관리할 책임이 있으며, 이를 제3자에게 양도·대여·공유할 수 없습니다.",
                        "계정 도용·무단 사용을 인지한 경우 즉시 회사에 통지하고 안내에 따라야 합니다.",
                        "위 의무를 게을리하여 발생한 불이익에 대하여 회사는 책임을 지지 않습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제6조 (서비스의 제공 및 변경)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회사는 매일 한 장의 명대사 카드, 카드 둘러보기·검색, 북마크, 기타 회사가 추가로 제공하는 서비스를 제공합니다.",
                        "서비스는 연중무휴 1일 24시간 제공을 원칙으로 하나, 시스템 점검·장애·천재지변 등 부득이한 사유가 있는 경우 일시 중단될 수 있습니다.",
                        "회사는 운영·기술상 필요에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 이 경우 사전에(부득이한 경우 사후에) 공지합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제7조 (콘텐츠의 성격 및 AI 생성에 관한 고지)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "카드의 작품 정보·키워드·장면 설명·의의 등은 **인공지능(AI) 언어모델에 의해 자동 생성·요약된 것**으로, 사실과 다르거나 부정확한 내용이 포함될 수 있습니다.",
                        "회사는 콘텐츠의 정확성·완전성·신뢰성을 보증하지 않으며, 이용자가 이를 판단의 근거로 사용함에 따라 발생하는 결과에 대하여 책임을 지지 않습니다.",
                        "명대사·극본 발췌는 해당 작품에 대한 비평·소개·교육 등의 목적을 위해 **인용**의 범위에서 제공되며, 원저작물의 저작권은 각 저작권자에게 귀속됩니다.",
                        "이용자는 콘텐츠 중 오류·권리침해·부적절한 표현 등을 발견한 경우 제15조의 연락처로 통지할 수 있으며, 회사는 확인 후 합리적 범위에서 수정·삭제 등 조치를 취합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제8조 (지식재산권)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "서비스의 디자인·UI·로고·편집·구성 및 회사가 작성한 텍스트 등에 대한 권리는 회사에 귀속됩니다.",
                        "카드에 인용된 명대사·극본 등 원저작물의 권리는 해당 저작권자에게 있으며, 본 약관은 이용자에게 원저작물에 대한 권리를 부여하지 않습니다.",
                        "이용자는 회사 또는 권리자의 사전 동의 없이 콘텐츠를 복제·전송·배포 등 영리 목적에 이용할 수 없습니다. 다만 개인적·비영리적 감상 및 법령상 허용되는 인용은 예외로 합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제9조 (이용자의 의무)",
            listOf(
                DocBlock.Para("이용자는 다음 행위를 하여서는 안 됩니다."),
                DocBlock.Ordered(
                    listOf(
                        "타인 정보 도용·허위 사실 등록",
                        "회사 또는 제3자의 지식재산권·초상권·명예 등 권리 침해",
                        "콘텐츠의 무단 대량 수집·복제(크롤링·스크래핑) 또는 영리 목적 이용",
                        "서비스의 정상 운영 방해 또는 서버·설비에 과도한 부하 유발",
                        "회사 동의 없는 영업·광고 목적 이용",
                        "기타 관계 법령 및 본 약관 위배 행위",
                    ),
                ),
            ),
        ),
        DocSection(
            "제10조 (개인정보의 보호)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "개인정보의 수집·이용·보관·파기 등에 관한 사항은 별도의 **개인정보 처리방침**에 따릅니다.",
                        "회사는 서비스 제공·개선을 위하여 회원 식별정보, 북마크 등 이용 기록, 기기·접속 정보 등을 수집·이용할 수 있습니다.",
                        "회사는 운영·분석을 위하여 Supabase, Amplitude, Microsoft Clarity 등 제3자 처리위탁·제휴 서비스를 이용할 수 있으며, 관련 사항은 개인정보 처리방침에 명시합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제11조 (이용계약의 해지 및 이용제한)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회원은 언제든지 서비스 내 탈퇴 기능 또는 제15조의 연락처를 통해 회원 탈퇴를 신청할 수 있습니다.",
                        "탈퇴 시 관련 법령 및 개인정보 처리방침에 따라 보존이 필요한 정보를 제외한 데이터는 파기됩니다.",
                        "회사는 회원이 본 약관·법령을 위반한 경우 사전 통지 후(긴급 시 사후 통지) 이용을 정지하거나 이용계약을 해지할 수 있습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제12조 (서비스의 중단 및 종료)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "본 서비스는 AI PM 6기 과정의 일환으로 제공될 수 있으며, 회사는 운영·정책상 사유로 서비스의 전부 또는 일부를 종료할 수 있습니다.",
                        "서비스 종료 시 종료일로부터 상당한 기간 이전에 서비스 내 공지 등을 통해 알립니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제13조 (면책조항)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회사는 천재지변·통신장애·이용자 귀책 등 합리적 통제 범위를 벗어난 사유로 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.",
                        "회사는 무료로 제공되는 서비스와 관련하여 법령에 특별한 규정이 없는 한 이용자에게 발생한 손해에 대하여 책임을 지지 않습니다.",
                        "회사는 제7조에 따라 AI가 생성한 콘텐츠의 정확성·신뢰성을 보증하지 않으며, 이용자가 이에 의존하여 발생한 결과에 대하여 책임을 지지 않습니다.",
                        "회사는 이용자 간 또는 이용자와 제3자 간 서비스를 매개로 발생한 분쟁에 개입할 의무가 없습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제14조 (준거법 및 관할)",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "본 약관 및 분쟁에 대하여는 대한민국 법령을 준거법으로 합니다.",
                        "분쟁에 관한 소송은 민사소송법상의 관할 법원에 제기합니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "제15조 (문의처)",
            listOf(
                DocBlock.Unordered(
                    listOf(
                        "**서비스명**: Daily Script — 오늘의 명대사",
                        "**운영자**: Daily Script Team",
                        "**이메일**: 23happylab@gmail.com",
                    ),
                ),
            ),
        ),
    ),
    footer = "부칙 — 본 약관은 2026년 5월 29일부터 시행합니다.",
)

fun privacyDoc() = LegalDoc(
    barTitle = "개인정보 처리방침",
    docTitle = "Daily Script 개인정보 처리방침",
    effectiveDate = "시행일: 2026년 5월 29일",
    intro = "**Daily Script**(이하 \"회사\")는 **\"Daily Script — 오늘의 명대사\"**(이하 \"서비스\") " +
        "이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관계 법령을 준수합니다. " +
        "본 방침은 회사가 어떤 개인정보를 수집·이용하며 이를 어떻게 보호하는지를 설명합니다.",
    sections = listOf(
        DocSection(
            "1. 수집하는 개인정보 항목",
            listOf(
                DocBlock.Sub("가. 회원가입·로그인 시"),
                DocBlock.Unordered(
                    listOf(
                        "이메일·비밀번호 가입: 이메일 주소, 비밀번호(암호화 저장)",
                        "소셜 로그인(카카오·구글): 제공자로부터 전달받는 계정 식별자, 이메일, 프로필 이름 등 이용자가 동의한 항목",
                    ),
                ),
                DocBlock.Sub("나. 서비스 이용 과정에서 자동 생성·수집되는 정보"),
                DocBlock.Unordered(
                    listOf(
                        "북마크 등 이용자가 저장·생성한 데이터",
                        "기기 정보(OS·브라우저), 접속 IP, 접속 일시, 이용 기록(조회·클릭 등), 쿠키 및 유사 식별자",
                    ),
                ),
                DocBlock.Para(
                    "비회원(익명 이용자)의 경우 별도 식별정보 없이 브라우저에 저장되는 익명 식별자를 통해 북마크 등이 제공되며, 로그인 시 해당 데이터가 계정으로 연동될 수 있습니다.",
                ),
            ),
        ),
        DocSection(
            "2. 개인정보의 수집·이용 목적",
            listOf(
                DocBlock.Unordered(
                    listOf(
                        "회원 식별·인증 및 계정 관리",
                        "명대사 카드 제공, 북마크 동기화 등 서비스 기능 제공",
                        "맞춤 추천 등 서비스 개인화(이용자가 동의한 경우)",
                        "이용 현황 분석 및 품질 개선, 오류·부정이용 방지",
                        "공지사항 전달 및 문의 응대",
                    ),
                ),
            ),
        ),
        DocSection(
            "3. 개인정보의 보유 및 이용 기간",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "수집·이용 목적 달성 또는 회원 탈퇴 시 해당 개인정보를 지체 없이 파기합니다.",
                        "다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다. (예: 접속 기록 — 「통신비밀보호법」에 따라 3개월)",
                    ),
                ),
            ),
        ),
        DocSection(
            "4. 개인정보의 제3자 제공",
            listOf(
                DocBlock.Para(
                    "회사는 본 방침에 명시한 범위를 넘어 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 사전 동의한 경우, 또는 법령에 따라 제출 의무가 있거나 수사기관이 적법한 절차에 따라 요청하는 경우는 예외로 합니다.",
                ),
            ),
        ),
        DocSection(
            "5. 개인정보 처리의 위탁",
            listOf(
                DocBlock.Para("회사는 안정적인 서비스 제공을 위하여 다음과 같이 개인정보 처리를 위탁하고 있습니다."),
                DocBlock.Table(
                    headers = listOf("수탁자", "위탁 업무", "비고"),
                    rows = listOf(
                        listOf("Supabase", "데이터베이스 저장 및 회원 인증", "국외(해외 리전) 처리될 수 있음"),
                        listOf("Amplitude", "서비스 이용 행태 분석", "국외 처리"),
                        listOf("Microsoft Clarity", "이용 행태·세션 분석", "국외 처리"),
                        listOf("카카오 / 구글", "소셜 로그인 인증", "이용자가 선택한 경우에 한함"),
                    ),
                ),
                DocBlock.Para(
                    "위 수탁자는 위탁받은 업무 범위 내에서만 개인정보를 처리하며, 회사는 관계 법령에 따라 수탁자를 관리·감독합니다.",
                ),
            ),
        ),
        DocSection(
            "6. 개인정보의 국외 이전",
            listOf(
                DocBlock.Para(
                    "본 서비스는 위 수탁자(Supabase, Amplitude, Microsoft Clarity 등)의 해외 인프라를 이용하므로, 이용자의 개인정보가 국외에서 저장·처리될 수 있습니다. 이용자는 회원가입 및 서비스 이용으로써 이에 동의한 것으로 봅니다.",
                ),
            ),
        ),
        DocSection(
            "7. 쿠키 및 유사 기술의 사용",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "회사는 인증 유지, 설정 저장, 이용 행태 분석 등을 위하여 쿠키 및 브라우저 저장소(localStorage 등)와 유사 식별자를 사용합니다.",
                        "이용자는 브라우저 설정으로 쿠키 저장을 거부할 수 있으나, 이 경우 로그인 유지 등 일부 기능 이용에 제한이 있을 수 있습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "8. 이용자 및 법정대리인의 권리",
            listOf(
                DocBlock.Ordered(
                    listOf(
                        "이용자는 언제든지 개인정보를 조회·수정하거나 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.",
                        "열람·정정·삭제·처리정지 요구는 서비스 내 기능 또는 아래 문의처를 통해 할 수 있으며, 회사는 지체 없이 조치합니다.",
                        "만 14세 미만 아동의 개인정보는 법정대리인의 동의 하에 처리되며, 법정대리인이 권리를 행사할 수 있습니다.",
                    ),
                ),
            ),
        ),
        DocSection(
            "9. 개인정보의 안전성 확보 조치",
            listOf(
                DocBlock.Para(
                    "회사는 비밀번호 암호화, 접근 권한 관리, 전송 구간 암호화(HTTPS) 등 관리적·기술적 보호조치를 취하고 있습니다.",
                ),
            ),
        ),
        DocSection(
            "10. 개인정보 보호책임자 및 문의처",
            listOf(
                DocBlock.Unordered(
                    listOf(
                        "**서비스명**: Daily Script — 오늘의 명대사",
                        "**개인정보 보호책임자**: Daily Script 운영팀",
                        "**이메일**: 23happylab@gmail.com",
                    ),
                ),
                DocBlock.Para(
                    "기타 개인정보 침해 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr / 118), 대검찰청 사이버수사과(spo.go.kr / 1301), 경찰청 사이버수사국(ecrm.police.go.kr / 182)에 문의할 수 있습니다.",
                ),
            ),
        ),
        DocSection(
            "11. 개인정보 처리방침의 변경",
            listOf(
                DocBlock.Para(
                    "본 방침은 법령·정책 변경에 따라 개정될 수 있으며, 변경 시 시행일 및 변경 내용을 서비스 내에 공지합니다.",
                ),
            ),
        ),
    ),
    footer = "시행일 — 2026년 5월 29일",
)
