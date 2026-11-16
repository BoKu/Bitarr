/*
 * Bittorrent Client using Qt and libtorrent.
 * Copyright (C) 2021  Mike Tzou (Chocobo1)
 * Copyright (C) 2010  Christophe Dumez <chris@qbittorrent.org>
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

#include "programupdater.h"

#include <algorithm>

#include <libtorrent/version.hpp>

#include <QtCore/qconfig.h>
#include <QtSystemDetection>
#include <QDebug>
#include <QDesktopServices>
#include <QJsonDocument>
#include <QJsonValue>
#include <QRegularExpression>
#include <QXmlStreamReader>

#include "base/global.h"
#include "base/logger.h"
#include "base/net/downloadmanager.h"
#include "base/preferences.h"
#include "base/version.h"

namespace
{
    bool isVersionMoreRecent(const ProgramUpdater::Version &remoteVersion)
    {
        if (!remoteVersion.isValid())
            return false;

        const ProgramUpdater::Version currentVersion {QBT_VERSION_MAJOR, QBT_VERSION_MINOR, QBT_VERSION_BUGFIX, QBT_VERSION_BUILD};
        if (remoteVersion == currentVersion)
        {
            const bool isDevVersion = QStringLiteral(QBT_VERSION_STATUS).contains(
                QRegularExpression(u"(alpha|beta|rc)"_s));
            if (isDevVersion)
                return true;
        }
        return (remoteVersion > currentVersion);
    }
}

void ProgramUpdater::checkForUpdates()
{
    // GitHub's API rejects requests without a User-Agent; the download manager supplies a default one.
    const auto LATEST_RELEASE_URL = u"https://api.github.com/repos/BoKu/Bitarr/releases/latest"_s;

    Net::DownloadManager *netManager = Net::DownloadManager::instance();
    const bool useProxy = Preferences::instance()->useProxyForGeneralPurposes();

    netManager->download(Net::DownloadRequest(LATEST_RELEASE_URL), useProxy, this, [this](const Net::DownloadResult &result)
    {
        updateInfoDownloadFinished(result);
    });
}

ProgramUpdater::Version ProgramUpdater::getNewVersion() const
{
    return m_newVersion;
}

void ProgramUpdater::updateInfoDownloadFinished(const Net::DownloadResult &result)
{
    m_newVersion = {};

    if (result.status != Net::DownloadStatus::Success)
    {
        LogMsg(tr("Failed to download the program update info. URL: \"%1\". Error: \"%2\"").arg(result.url, result.errorString) , Log::WARNING);
        emit updateCheckFinished();
        return;
    }

    // "tag_name" is the release tag, e.g. "v0.1.0"
    const auto json = QJsonDocument::fromJson(result.data);
    if (const QJsonValue tagJSON = json[u"tag_name"_s]; tagJSON.isString())
    {
        QString tag = tagJSON.toString();
        if (tag.startsWith(u'v', Qt::CaseInsensitive))
            tag.remove(0, 1);

        const Version tmpVer {tag};
        if (isVersionMoreRecent(tmpVer))
            m_newVersion = tmpVer;
    }

    emit updateCheckFinished();
}

bool ProgramUpdater::updateProgram() const
{
    return QDesktopServices::openUrl(u"https://github.com/BoKu/Bitarr/releases"_s);
}
