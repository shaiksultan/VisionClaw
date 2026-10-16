package com.meta.wearable.dat.externalsampleapps.cameraaccess.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.HeadsetMic
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private data class OnboardingPage(
    val title: String,
    val body: String,
    val icons: List<ImageVector>,
)

private val OnboardingPages = listOf(
    OnboardingPage(
        title = "Meet LAB AI Assistant",
        body = "Voice-first help for the telecom lab. Connect Ray-Ban Meta glasses or this phone and ask how I can help.",
        icons = listOf(Icons.Filled.AutoAwesome, Icons.Filled.Visibility),
    ),
    OnboardingPage(
        title = "Lab agents ready by voice",
        body = "Inventory, Knowledge, Mobile PS, Evidence Tickets, Lab Expert Engineer, Digital Capture, and Visual Troubleshoot.",
        icons = listOf(Icons.Filled.HeadsetMic, Icons.Filled.AutoAwesome),
    ),
    OnboardingPage(
        title = "Music & Football · audio live",
        body = "Say “play music” for free music radio, or “live football” for sports commentary — audio only from free public streams.",
        icons = listOf(Icons.Filled.MusicNote, Icons.Filled.SportsSoccer),
    ),
)

@Composable
fun OnboardingScreen(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pagerState = rememberPagerState(pageCount = { OnboardingPages.size })
    val scope = rememberCoroutineScope()
    val isLast = pagerState.currentPage == OnboardingPages.lastIndex

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(LabVisionBackgroundBrush),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 22.dp)
                .padding(bottom = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onFinished) {
                    Text(
                        text = "Skip",
                        color = LabVisionColors.AccentBright,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) { page ->
                OnboardingPageContent(page = OnboardingPages[page])
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 16.dp),
            ) {
                repeat(OnboardingPages.size) { i ->
                    val active = i == pagerState.currentPage
                    Box(
                        modifier = Modifier
                            .height(8.dp)
                            .width(if (active) 28.dp else 8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(
                                if (active) LabVisionColors.AccentMuted
                                else LabVisionColors.SurfaceElevated,
                            ),
                    )
                }
            }

            Text(
                text = "By continuing you can connect glasses or this phone for LAB Vision agents.",
                color = LabVisionColors.TextSecondary,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Start = finish onboarding immediately (no need to swipe all pages)
            SwitchButton(
                label = "Start",
                onClick = onFinished,
                accent = true,
            )

            if (!isLast) {
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(
                    onClick = {
                        scope.launch {
                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    },
                ) {
                    Text(
                        text = "Next",
                        color = LabVisionColors.TextSecondary,
                        fontWeight = FontWeight.Medium,
                    )
                }
            } else {
                Spacer(modifier = Modifier.height(48.dp))
            }
        }
    }
}

@Composable
private fun OnboardingPageContent(page: OnboardingPage) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(220.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            LabVisionColors.Accent.copy(alpha = 0.22f),
                            LabVisionColors.SurfaceCard.copy(alpha = 0.9f),
                        ),
                    ),
                )
                .border(1.dp, LabVisionColors.Accent.copy(alpha = 0.35f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            BrandOrbLogo(size = 72.dp)
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 28.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                page.icons.forEach { icon ->
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(LabVisionColors.AccentMuted.copy(alpha = 0.85f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = LabVisionColors.TextPrimary,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        Text(
            text = page.title,
            color = LabVisionColors.TextPrimary,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 30.sp,
            modifier = Modifier.padding(horizontal = 8.dp),
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = page.body,
            color = LabVisionColors.TextSecondary,
            fontSize = 15.sp,
            lineHeight = 22.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
    }
}
