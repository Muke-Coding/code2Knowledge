package com.code2knowledge.runtime.mapper;

import com.code2knowledge.runtime.domain.entity.DeviceDO;
import com.code2knowledge.runtime.domain.entity.PairingDO;
import com.code2knowledge.runtime.domain.vo.DeviceVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 私有设备持久化入口；SQL在XML，服务持有事务。配对和心跳/撤销行锁串行，无软删除、共享或任务事件。 */
@Mapper
public interface RuntimeMapper {
    /**
     * @param pairing 新配对，摘要不为空
     * @param expiresAt UTC时间戳字符串，5分钟有效 */
    void insertPairing(@Param("pairing") PairingDO pairing, @Param("expiresAt") String expiresAt);
    /**
     * @param tenantId 当前企业UUID，不为空
     * @param ownerId 当前所有者UUID，不为空 */
    void invalidatePairings(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
    /**
     * @param hash 配对摘要，不为空
     * @return 有效配对，行锁持有到事务结束；不存在为null */
    PairingDO lockPairing(@Param("hash") String hash);
    /**
     * @param id 当前配对UUID，不为空
     * @return 消费条数，0表示已被消费 */
    int consume(@Param("id") String id);
    /**
     * @param device 新设备，不为空
     * @param expiresAt UTC时间戳字符串，30天有效 */
    void insertDevice(@Param("device") DeviceDO device, @Param("expiresAt") String expiresAt);
    /**
     * @param hash 专用设备凭证摘要，不为空
     * @return 有效设备并持行锁；撤销、过期或所有者版本失效为null */
    DeviceDO lockCredential(@Param("hash") String hash);
    /** @param id 已认证设备UUID，不为空 */
    void heartbeat(@Param("id") String id);
    /**
     * @param tenantId 可信企业UUID，不为空
     * @param ownerId 当前身份UUID，不为空
     * @return 私有设备列表，不含摘要，空列表表示无设备 */
    List<DeviceVO> list(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
    /**
     * @param tenantId 企业UUID，不为空
     * @param ownerId 当前身份UUID，不为空
     * @param id 目标设备UUID，不为空
     * @return 所有者设备，行锁；无权或不存在为null */
    DeviceDO lockOwned(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("id") String id);
    /**
     * @param id 已由所有权校验的设备UUID，不为空
     * @return 本次变更数，已撤销为0 */
    int revoke(@Param("id") String id);
    /**
     * @param hash 配对码摘要，不为空
     * @return 有效配对快照，未锁；不存在为null */
    PairingDO findPairing(@Param("hash") String hash);
    /**
     * @param hash 设备凭证摘要，不为空
     * @return 有效设备快照，未锁；不存在为null */
    DeviceDO findCredential(@Param("hash") String hash);
}
