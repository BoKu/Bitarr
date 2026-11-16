/*
 * Bittorrent Client using Qt and libtorrent.
 * Copyright (C) 2006  Christophe Dumez <chris@qbittorrent.org>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * In addition, as a special exception, the copyright holders give permission to
 * link this program with the OpenSSL project's "OpenSSL" library (or with
 * modified versions of it that use the same license as the "OpenSSL" library),
 * and distribute the linked executables. You must obey the GNU General Public
 * License in all respects for all of the code used other than "OpenSSL".  If you
 * modify file(s), you may extend this exception to your version of the file(s),
 * but you are not obligated to do so. If you do not wish to do so, delete this
 * exception statement from your version.
 */

#include "hidabletabwidget.h"

#include <QCursor>
#include <QHBoxLayout>
#include <QIcon>
#include <QLabel>
#include <QMouseEvent>
#include <QPainter>
#include <QPaintEvent>
#include <QResizeEvent>
#include <QStyle>
#include <QStyleOption>
#include <QTabBar>

#include "base/global.h"

namespace
{
    // Vertical navigation rail in the style of Sonarr/Radarr: icon + horizontal label per page.
    class NavTabBar final : public QTabBar
    {
    public:
        explicit NavTabBar(QWidget *parent = nullptr)
            : QTabBar(parent)
        {
            setObjectName(u"navRail"_s);
            setShape(QTabBar::RoundedWest);
            setExpanding(false);
            setDrawBase(false);
            setMouseTracking(true);
            setIconSize({20, 20});
            setAttribute(Qt::WA_StyledBackground, true);
        }

    private:
        QSize tabSizeHint(int) const override
        {
            return {240, 42};
        }
        void mouseMoveEvent(QMouseEvent *event) override
        {
            QTabBar::mouseMoveEvent(event);
            update();
        }

        void leaveEvent(QEvent *event) override
        {
            QTabBar::leaveEvent(event);
            update();
        }

        void paintEvent(QPaintEvent *) override
        {
            QPainter painter {this};
            painter.setRenderHint(QPainter::Antialiasing);

            QStyleOption background;
            background.initFrom(this);
            style()->drawPrimitive(QStyle::PE_Widget, &background, &painter, this);

            const int hovered = tabAt(mapFromGlobal(QCursor::pos()));
            const QColor accent = palette().color(QPalette::Highlight);
            const QColor text = palette().color(QPalette::Text);
            QFont labelFont = font();
            labelFont.setWeight(QFont::DemiBold);

            for (int i = 0; i < count(); ++i)
            {
                const QRect rect = tabRect(i).adjusted(6, 3, -16, -3); // lines up with the filter list below
                const bool selected = (i == currentIndex());

                painter.setPen(Qt::NoPen);
                if (selected)
                {
                    QColor fill = accent;
                    fill.setAlpha(36);
                    painter.setBrush(fill);
                    painter.drawRoundedRect(rect, 8, 8);
                    painter.setBrush(accent);
                    painter.drawRoundedRect(QRect(rect.left(), rect.top() + 9, 3, rect.height() - 18), 1.5, 1.5);
                }
                else if (i == hovered)
                {
                    QColor fill = text;
                    fill.setAlpha(18);
                    painter.setBrush(fill);
                    painter.drawRoundedRect(rect, 8, 8);
                }

                if (const QIcon icon = tabIcon(i); !icon.isNull())
                    icon.paint(&painter, QRect(rect.left() + 14, rect.center().y() - 10, 20, 20));

                painter.setFont(labelFont);
                painter.setPen(selected ? accent : text);
                const QRect textRect = rect.adjusted(46, 0, -8, 0);
                painter.drawText(textRect, (Qt::AlignVCenter | Qt::AlignLeft)
                        , painter.fontMetrics().elidedText(tabText(i), Qt::ElideRight, textRect.width()));
            }
        }
    };
}

HidableTabWidget::HidableTabWidget(QWidget *parent)
    : QTabWidget(parent)
{
    setObjectName(u"mainPages"_s);
    setTabBar(new NavTabBar(this));
    setTabPosition(QTabWidget::West);

    // The area beside the pages is the navigation rail: paint it slightly darker than the pages
    QPalette railPalette = palette();
    railPalette.setColor(QPalette::Window, railPalette.color(QPalette::Window).darker(150));
    setPalette(railPalette);
    setAutoFillBackground(true);

    connect(this, &QTabWidget::currentChanged, this, &HidableTabWidget::updateSidebar);

    // Skip single tab in keyboard navigation (no point navigating to it)
    tabBar()->setFocusPolicy(Qt::NoFocus);
}

void HidableTabWidget::setSidebarWidget(QWidget *widget, QWidget *page)
{
    m_sidebar = widget;
    m_sidebarPage = page;
    if (m_sidebar)
        m_sidebar->setParent(this);
    updateSidebar();
}

void HidableTabWidget::updateSidebar()
{
    if (!m_sidebar)
        return;

    const bool visible = (currentWidget() == m_sidebarPage);
    m_sidebar->setVisible(visible);
    if (!visible || (count() == 0))
        return;

    // Tab height is fixed (see NavTabBar), so don't depend on the tab bar having finished its layout
    const int top = tabBar()->geometry().top() + (count() * 42) + 16;
    m_sidebar->setGeometry(0, top, tabBar()->width(), qMax(0, height() - top));
    m_sidebar->raise();
}

void HidableTabWidget::resizeEvent(QResizeEvent *event)
{
    QTabWidget::resizeEvent(event);
    updateSidebar();
}

void HidableTabWidget::tabInserted(const int index)
{
    QTabWidget::tabInserted(index);
    tabsCountChanged();
}

void HidableTabWidget::tabRemoved(const int index)
{
    QTabWidget::tabRemoved(index);
    tabsCountChanged();
}

void HidableTabWidget::tabsCountChanged()
{
    const qsizetype tabsCount = count();
    tabBar()->setVisible(true); // the navigation rail is always shown
    updateSidebar();
    // Skip single tab in keyboard navigation (no point navigating to it)
    tabBar()->setFocusPolicy((tabsCount > 1) ? Qt::StrongFocus : Qt::NoFocus);
}

#ifdef Q_OS_MACOS
void HidableTabWidget::paintEvent(QPaintEvent *event)
{
    // Hide the pane for macintosh style
    if (!style()->inherits("QMacStyle"))
        QTabWidget::paintEvent(event);
}
#endif
