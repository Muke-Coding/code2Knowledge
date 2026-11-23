package com.code2knowledge.runtime.mapper;

import com.code2knowledge.runtime.domain.entity.ReadinessDO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 短期诊断SQL入口；服务先持企业锁，领取及提交串行，无软删除或事件投递。 */
@Mapper
public interface ReadinessMapper {
    /**
     * @param row 已核验企业、所有者和设备的检查，不为空 */
    void insert(@Param("row") ReadinessDO row);
    /**
     * @param tenantId 可信企业
     * @param ownerId 当前成员
     * @param id 本人检查UUID
     * @return 本人检查，隐藏对象null */
    ReadinessDO find(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("id") String id);
    /**
     * @param tenantId 可信企业
     * @param deviceId 本人设备
     * @return 未完成且未过期检查，空表示无项 */
    ReadinessDO pending(@Param("tenantId") String tenantId, @Param("deviceId") String deviceId);
    /**
     * @param id 已核验检查
     * @return 首次领取1，否则0 */
    int claim(@Param("id") String id);
    /**
     * @param id 已核验检查
     * @param checks 固定检查JSON
     * @return 当前检查成功提交1，否则0 */
    int complete(@Param("id") String id, @Param("checks") String checks);
    /**
     * @param id 已认证设备的失效诊断UUID，只将期限收敛到当前时刻，不产生结果
     */
    void expire(@Param("id") String id);
    /**
     * @param tenantId 当前企业
     * @param ownerId 当前请求者；只清理本人已过期记录 */
    void prune(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
}
